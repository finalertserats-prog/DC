# gateway_app/services/commands.py
from __future__ import annotations

import string
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Optional, Tuple

from ..config.settings import settings
from .audit import log_action, log_command
from .conversation_store_redis import RedisConversationStore
from .prompts import (
    SYSTEM_PROMPT_V1,
    SYSTEM_PROMPT_OPENMETADATA,
    SYSTEM_PROMPT_OPENMETADATA_UNAVAILABLE,
)


def _now_iso_ist() -> str:
    return datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()


def _strip_trailing_punct(s: str) -> str:
    return s.rstrip(string.punctuation + " ")


def _mark_from_mode(mode: str) -> Tuple[str, str]:
    m = (mode or "v1.0").strip().lower()
    if m in ("v3.0", "v2.0"):
        return ("Mark II", m)
    return ("Mark I", "v1.0")


def _help_text(mark_label: str, mode_norm: str) -> str:
    if mode_norm in ("v2.0", "v3.0"):
        title = f"**{mark_label} (Assistant + Direct Database Access)**"
        cap_lines = [
            "### What I can do",
            "- Answer questions and draft content.",
            "- Query the Snowflake database directly using natural language (read-only).",
            "- Schema is auto-discovered from OpenMetadata catalog.",
        ]
        cmd_lines = [
            "### Commands",
            "- `/help` — Show what Friday can do and the available commands.",
            "- `/stop` — Cancel the currently running response (if any).",
            "- `/tools` — List available database tables.",
            "- `/history purge` — Clear conversation history for this chat.",
        ]
    else:
        title = f"**{mark_label} (General Assistant)**"
        cap_lines = [
            "### What I can do",
            "- Answer questions and explain concepts.",
            "- Draft and refine messages, summaries, and tables.",
            "- Help with planning and problem-solving (read-only).",
        ]
        cmd_lines = [
            "### Commands",
            "- `/help` — Show what Friday can do.",
            "- `/stop` — Cancel the currently running response (if any).",
            "- `/history purge` — Clear conversation history for this chat.",
        ]

    return "\n".join([title, "", *cap_lines, "", *cmd_lines, ""])


class CommandsService:
    def __init__(self, store: RedisConversationStore):
        self.store = store
        self.redis = self.store._redis

    def _normalize_user(self, user_id: Optional[str]) -> str:
        return user_id or settings.SINGLE_USER_ID

    def _get_agent_mode(self, user_id: Optional[str], conv_id: str) -> str:
        try:
            mode = self.store.get_state(user_id, conv_id, "agent_mode")
            return str(mode or "v1.0")
        except Exception:
            return "v1.0"

    async def _seed_initial_system_messages(self, user_id: Optional[str], conv_id: str, mode: str) -> None:
        """After /history purge, re-seed system prompts for the new session."""
        base_ts = _now_iso_ist()
        mode_norm = _mark_from_mode(mode)[1]

        if mode_norm == "v1.0":
            self.store.append(user_id, conv_id, "system", SYSTEM_PROMPT_V1, ts=base_ts)
            self.store.append(user_id, conv_id, "system",
                              SYSTEM_PROMPT_OPENMETADATA_UNAVAILABLE, ts=base_ts)
        else:
            self.store.append(user_id, conv_id, "system", SYSTEM_PROMPT_OPENMETADATA, ts=base_ts)
            try:
                from .openmetadata_client import OpenMetadataClient
                om = OpenMetadataClient()
                # Pass user_id so schema is filtered to only tables this user can access,
                # matching the identity-aware fetch in agent.py run_stream.
                schema_ctx = om.get_schema_context(user_id=user_id)
                if schema_ctx and schema_ctx != "No tables available from OpenMetadata.":
                    self.store.append(user_id, conv_id, "system",
                                      f"Database Schema:\n{schema_ctx}", ts=base_ts)
            except Exception:
                self.store.append(user_id, conv_id, "system",
                                  SYSTEM_PROMPT_OPENMETADATA_UNAVAILABLE, ts=base_ts)

    async def _history_purge_and_restart(self, user_id: Optional[str], conv_id: str) -> str:
        self.store.purge(user_id, conv_id)

        # Default to v2.0 (will re-detect on next message)
        mode = "v2.0"
        self.store.set_state(user_id, conv_id, "agent_mode", mode)
        await self._seed_initial_system_messages(user_id, conv_id, mode)

        mark_label, _ = _mark_from_mode(mode)
        log_action("history.purge", user_id=user_id, conversation_id=conv_id)
        log_command("/history purge", {"mode": mode}, success=True, user_id=user_id, conversation_id=conv_id)
        return f"History purged. Restarted session in {mark_label}."

    async def process(self, user_id: Optional[str], conv_id: str, text: str) -> str:
        parts = (text or "").strip().split()
        if not parts:
            return "Empty command. Use /help."

        cmd = parts[0].lower()

        # /history purge
        if cmd == "/history":
            sub = parts[1].lower() if len(parts) >= 2 else ""
            if sub == "purge":
                return await self._history_purge_and_restart(user_id, conv_id)
            log_command("/history", {"text": text}, success=False, user_id=user_id, conversation_id=conv_id)
            return "Usage: /history purge"

        mode = self._get_agent_mode(user_id, conv_id)
        mark_label, mode_norm = _mark_from_mode(mode)

        if cmd == "/help":
            return _help_text(mark_label, mode_norm)

        if cmd == "/stop":
            log_command("/stop", {}, success=True, user_id=user_id, conversation_id=conv_id)
            return "Stopping the current response…"

        if cmd == "/tools":
            try:
                from .openmetadata_client import OpenMetadataClient
                om = OpenMetadataClient()
                tables = om.get_tables()
                if not tables:
                    log_command("/tools", {}, success=False, user_id=user_id, conversation_id=conv_id)
                    return "No tables available from OpenMetadata. The catalog may be unreachable."
                lines = ["**Available Database Tables:**", ""]
                for t in tables:
                    name = t.get("name", "unknown")
                    desc = t.get("description", "") or ""
                    col_count = len(t.get("columns", []))
                    desc_part = f" — {desc[:80]}" if desc else ""
                    lines.append(f"- **{name}** ({col_count} columns){desc_part}")
                lines.append(f"\n_{len(tables)} table(s) discovered from OpenMetadata catalog._")
                log_command("/tools", {"count": len(tables)}, success=True, user_id=user_id, conversation_id=conv_id)
                return "\n".join(lines)
            except Exception as e:
                log_command("/tools", {"error": str(e)}, success=False, user_id=user_id, conversation_id=conv_id)
                return f"Failed to fetch tables from OpenMetadata: {e}"

        if cmd == "/servers":
            om_url = getattr(settings, "OPENMETADATA_URL", "N/A")
            sf_acct = getattr(settings, "SNOWFLAKE_ACCOUNT", "N/A")
            sf_db = getattr(settings, "SNOWFLAKE_DATABASE", "N/A")
            sr_host = getattr(settings, "STARROCKS_HOST", "N/A")
            sr_db = getattr(settings, "STARROCKS_DATABASE", "N/A") or "default"
            lines = [
                "**Data Sources:**",
                "",
                f"- **OpenMetadata Catalog**: {om_url}",
                f"- **Snowflake**: account={sf_acct}, database={sf_db}",
                f"- **StarRocks**: host={sr_host}, database={sr_db}",
            ]
            log_command("/servers", {}, success=True, user_id=user_id, conversation_id=conv_id)
            return "\n".join(lines)

        return "Unknown command. Use /help."
