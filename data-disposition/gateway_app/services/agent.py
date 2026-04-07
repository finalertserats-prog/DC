# gateway_app/services/agent.py
from __future__ import annotations

import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Callable, Awaitable, Optional, Set, Tuple

from ..api.schemas import enforce_output_safety
from .llm_client import LLMClient
from .conversation_store_redis import RedisConversationStore
from .table_utils import extract_rows_from_payload, parse_markdown_table_to_rows
from .telemetry import trace, exception
from .stream_utils import RateLimiter, sanitize_markdown
from .attachments import build_csv_attachment, build_chart_attachment
from .exceptions import GatewayException
from .access_registry import AccessRegistry
from ..config.settings import settings

# Bind LLM-related fields for logging context
from gateway_app.services.log_context import bind_context

from .prompts import (
    SYSTEM_PROMPT_V1,
    SYSTEM_PROMPT_OPENMETADATA,
    SYSTEM_PROMPT_OPENMETADATA_UNAVAILABLE,
    WELCOME_TEXT_V1,
    WELCOME_TEXT_OPENMETADATA,
)


def _now_iso_ist() -> str:
    return datetime.now(ZoneInfo("Asia/Kolkata")).isoformat()


def _sanitize_messages(msgs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    sanitized: List[Dict[str, Any]] = []
    for m in msgs:
        m2 = dict(m)
        if "content" in m2 and m2["content"] is None:
            m2["content"] = ""
        if m2.get("role") == "tool" and not isinstance(m2.get("content"), str):
            m2["content"] = json.dumps(m2.get("content", ""), default=str)
        sanitized.append(m2)
    return sanitized


def _local_tools_openai() -> List[Dict[str, Any]]:
    """Local tools available in every mode (export, chart, Teams summary)."""
    return [
        {
            "type": "function",
            "function": {
                "name": "local__to_csv",
                "description": (
                    "Convert a list of objects (table) to CSV and attach it. "
                    "If 'table' is omitted, use the last materialized rows."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "table": {"type": "array", "items": {"type": "object"}},
                        "filename": {"type": "string", "description": "Optional filename, e.g., report.csv"},
                    },
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "local__chart",
                "description": (
                    "Render a quick chart (line/bar/scatter/pie) and attach PNG. "
                    "If 'table' is omitted, use the last materialized rows. "
                    "COLOR RULES: "
                    "(1) If the user assigns DIFFERENT colors to DIFFERENT categories or labels "
                    "(e.g. 'blue for male, pink for female', 'males in blue and females in pink'), "
                    "use color_map — never use color in this case. "
                    "(2) If the user specifies ONE color for the whole chart "
                    "(e.g. 'in green', 'show as red'), use the color argument. "
                    "(3) For pie charts with per-slice colors always use color_map, "
                    "with keys exactly matching the values in the x column."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "table": {"type": "array", "items": {"type": "object"}},
                        "x": {"type": "string"},
                        "y": {"type": "string"},
                        "kind": {"type": "string", "enum": ["line", "bar", "scatter", "pie"]},
                        "title": {"type": "string"},
                        "filename": {"type": "string", "description": "Optional filename, e.g., chart.png"},
                        "color": {"type": "string", "description": "Single color for the entire chart (e.g. 'green', '#FF5733'). Do NOT use for per-category coloring — use color_map instead."},
                        "color_map": {"type": "object", "description": "Per-category color mapping. Keys must exactly match the x column values (case-insensitive). Example: {\"male\": \"blue\", \"female\": \"pink\", \"other\": \"grey\"}. Use this whenever the user assigns different colors to different categories or pie slices."},
                    },
                    "required": ["x", "y"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "teams__get_chat_summary",
                "description": (
                    "Use Microsoft Graph to retrieve messages from a Teams chat or channel so you can "
                    "summarize the conversation or analyze activity. "
                    "If chat or channel identifiers are omitted, use the current conversation id as the chat id."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "chat_id": {"type": "string", "description": "Optional Microsoft Graph chat id."},
                        "team_id": {"type": "string", "description": "Optional team id for channel conversations."},
                        "channel_id": {"type": "string", "description": "Optional channel id within a team."},
                        "from_iso": {"type": "string", "description": "Optional ISO-8601 start time (inclusive)."},
                        "to_iso": {"type": "string", "description": "Optional ISO-8601 end time (exclusive)."},
                        "max_messages": {"type": "integer", "description": "Maximum number of messages to retrieve."},
                    },
                },
            },
        },
    ]


def _openmetadata_tools() -> List[Dict[str, Any]]:
    """Tools exposed to the LLM for direct Snowflake SQL execution."""
    return [
        {
            "type": "function",
            "function": {
                "name": "execute_sql",
                "description": (
                    "Execute a read-only SQL query on the Snowflake database. "
                    "Only SELECT, WITH (CTE), SHOW, DESCRIBE, and EXPLAIN statements are allowed. "
                    "Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked. "
                    "Use the table and column names from the database schema provided in the system message."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "The SQL query to execute. Must be a read-only SELECT statement.",
                        },
                    },
                    "required": ["sql"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "execute_starrocks_sql",
                "description": (
                    "Execute a read-only SQL query on the StarRocks database. "
                    "Only SELECT, WITH (CTE), SHOW, DESCRIBE, and EXPLAIN statements are allowed. "
                    "Write operations (INSERT, UPDATE, DELETE, DROP, etc.) are blocked. "
                    "Use the table and column names from the database schema provided in the system message."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sql": {
                            "type": "string",
                            "description": "The SQL query to execute. Must be a read-only SELECT statement.",
                        },
                    },
                    "required": ["sql"],
                },
            },
        },
    ]


def _wants_export(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in ["csv", "export", "download"])


def _wants_chart(text: str) -> bool:
    t = (text or "").lower()
    return any(k in t for k in ["chart", "graph", "plot", "visualize", "visualisation", "visualization"])


def _wants_history(text: str) -> bool:
    t = (text or "").lower()
    history_keywords = [
        "summarize this chat",
        "summarise this chat",
        "summarize this conversation",
        "summary of this chat",
        "recap this chat",
        "chat history",
        "conversation history",
        "how many users were active",
        "user activity",
        "who was active yesterday",
        "messages yesterday",
    ]
    return any(k in t for k in history_keywords)


class Agent:
    def __init__(self, store: Optional[RedisConversationStore] = None):
        self.llm = LLMClient()
        self.store = store or RedisConversationStore()
        # NOTE: _on_attachment and _attachments_sent_this_turn are intentionally
        # NOT stored on self — they are passed per-call to avoid cross-conversation
        # races on the shared Agent instance. See run_stream / _execute_tool_calls.
        self.registry = AccessRegistry()

        # Lazily initialized OpenMetadata + Snowflake + StarRocks clients
        self._om_client = None
        self._sf_executor = None
        self._sr_executor = None

    @property
    def om_client(self):
        if self._om_client is None:
            from .openmetadata_client import OpenMetadataClient
            self._om_client = OpenMetadataClient()
        return self._om_client

    @property
    def sf_executor(self):
        if self._sf_executor is None:
            from .snowflake_executor import SnowflakeExecutor
            self._sf_executor = SnowflakeExecutor()
        return self._sf_executor

    @property
    def sr_executor(self):
        if self._sr_executor is None:
            from .starrocks_executor import StarRocksExecutor
            self._sr_executor = StarRocksExecutor()
        return self._sr_executor

    def is_new_conversation(self, user_id: Optional[str], conversation_id: str) -> bool:
        return len(self.store.get(user_id, conversation_id)) == 0

    def get_welcome_text(self) -> str:
        return WELCOME_TEXT_OPENMETADATA

    def _repair_history(self, user_id: Optional[str], conversation_id: str) -> None:
        msgs = self.store.get(user_id, conversation_id)
        if not msgs:
            return

        tool_ids_present: Set[str] = set()
        for m in msgs:
            if m.get("role") == "tool":
                tcid = m.get("tool_call_id")
                if tcid:
                    tool_ids_present.add(tcid)

        repaired: List[Dict[str, Any]] = []
        allowed_ids_so_far: Set[str] = set()

        for m in msgs:
            role = m.get("role")
            if role == "assistant" and m.get("tool_calls"):
                tcs = m.get("tool_calls") or []
                filtered = [tc for tc in tcs if tc.get("id") in tool_ids_present]
                if filtered:
                    m2 = dict(m)
                    m2["tool_calls"] = filtered
                    repaired.append(m2)
                    for tc in filtered:
                        tid = tc.get("id")
                        if tid:
                            allowed_ids_so_far.add(tid)
                else:
                    m2 = dict(m)
                    m2.pop("tool_calls", None)
                    repaired.append(m2)
            elif role == "tool":
                tcid = m.get("tool_call_id")
                if tcid and tcid in allowed_ids_so_far:
                    repaired.append(m)
                else:
                    continue
            else:
                repaired.append(m)

        while repaired and repaired[0].get("role") == "tool":
            repaired.pop(0)

        if repaired != msgs:
            self.store.overwrite(user_id, conversation_id, repaired)

    async def _plan_round(
        self,
        user_id: Optional[str],
        conversation_id: str,
        tools: List[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], int]:
        self._repair_history(user_id, conversation_id)

        t_llm0 = time.monotonic()
        resp = self.llm.chat(
            messages=_sanitize_messages(self.store.get(user_id, conversation_id)),
            tools=tools,
            tool_choice="auto",
        )
        planning_ms = int((time.monotonic() - t_llm0) * 1000)

        bind_context(llm_called=True, llm_model=self.llm.model_name)
        trace("llm.chat", {"latency_ms": planning_ms, "model": self.llm.model_name})

        msg = resp["choices"][0]["message"]
        tool_calls = msg.get("tool_calls") or []

        if tool_calls:
            assistant_msg = {
                "role": "assistant",
                "content": msg.get("content") or "",
                "tool_calls": tool_calls,
                "ts": _now_iso_ist(),
            }
            self.store.extend(user_id, conversation_id, [assistant_msg])

        return msg, planning_ms

    async def _execute_tool_calls(
        self,
        user_id: Optional[str],
        conversation_id: str,
        tool_calls: List[Dict[str, Any]],
        on_attachment: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
        attachments_counter: Optional[List[int]] = None,
    ) -> None:
        out_msgs: List[Dict[str, Any]] = []
        last_rows: Optional[List[Dict[str, Any]]] = None

        for call in tool_calls or []:
            fn = call["function"]["name"]
            raw_args = call["function"].get("arguments") or "{}"
            args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})

            payload: Dict[str, Any] = {"is_error": True, "text": "uninitialized"}

            try:
                if fn == "execute_sql":
                    sql = args.get("sql", "")
                    if not sql.strip():
                        payload = {"is_error": True, "text": "No SQL query provided."}
                    elif self.sf_executor is None:
                        payload = {"is_error": True, "text": "Snowflake executor is not configured."}
                    else:
                        from gateway_app.services.audit import log_tool_call
                        trace("execute_sql", {"sql": sql[:200], "user": user_id})
                        payload = self.sf_executor.execute_query(sql, user_id=user_id)
                        log_tool_call(
                            tool_name="execute_sql",
                            server="snowflake",
                            arguments={"sql": sql},
                            success=not payload.get("is_error", False),
                            error=payload.get("text") if payload.get("is_error") else None,
                            user_id=user_id,
                            conversation_id=conversation_id,
                        )

                elif fn == "execute_starrocks_sql":
                    sql = args.get("sql", "")
                    if not sql.strip():
                        payload = {"is_error": True, "text": "No SQL query provided."}
                    elif self.sr_executor is None:
                        payload = {"is_error": True, "text": "StarRocks executor is not configured."}
                    else:
                        from gateway_app.services.audit import log_tool_call
                        trace("execute_starrocks_sql", {"sql": sql[:200], "user": user_id})
                        payload = self.sr_executor.execute_query(sql, user_id=user_id)
                        if payload.get("is_error") and "Access denied" in (payload.get("text") or ""):
                            payload["access_denied"] = True
                        # For wide tables (>12 cols), store pre-formatted table so LLM doesn't garble it
                        cols = payload.get("columns", [])
                        if not payload.get("is_error") and len(cols) > 12:
                            payload["_preformatted_table"] = payload.get("text", "")
                            payload["text"] = (
                                f"Query returned {payload.get('row_count', 0)} rows with {len(cols)} columns. "
                                f"The formatted table will be displayed directly. "
                                f"Available column names: {cols}"
                            )
                        log_tool_call(
                            tool_name="execute_starrocks_sql",
                            server="starrocks",
                            arguments={"sql": sql},
                            success=not payload.get("is_error", False),
                            error=payload.get("text") if payload.get("is_error") else None,
                            user_id=user_id,
                            conversation_id=conversation_id,
                        )

                elif fn == "local__to_csv":
                    rows_arg = args.get("table")
                    rows = rows_arg if rows_arg else self._get_fallback_rows(user_id, conversation_id)
                    name = (args.get("filename") or "export.csv")
                    if not rows:
                        payload = {"is_error": True, "note": "No rows available for CSV export."}
                    else:
                        from gateway_app.services.attachment_store import attachment_store
                        attach, note = build_csv_attachment(rows, name)

                        if attach is None:
                            payload = {"is_error": True, "note": note}
                        else:
                            csv_file_id = attachment_store.save(attach["bytes"], name, attach["content_type"])
                            import urllib.parse
                            safe_csv_name = urllib.parse.quote(name)
                            download_url = f"/api/attachments/{csv_file_id}/{safe_csv_name}"

                            enhanced_note = f"{note} Download link: {download_url}"
                            payload = {"is_error": False, "note": enhanced_note, "attached": True, "name": name, "url": download_url}

                            if on_attachment:
                                if attachments_counter is not None:
                                    attachments_counter[0] += 1
                                await on_attachment(attach)

                elif fn == "local__chart":
                    rows_arg = args.get("table")
                    rows = rows_arg if rows_arg else self._get_fallback_rows(user_id, conversation_id)
                    x = args.get("x")
                    y = args.get("y")
                    kind = args.get("kind") or "line"
                    title = args.get("title")
                    color = args.get("color")
                    color_map = args.get("color_map")
                    name = args.get("filename") or "chart.png"
                    if not rows:
                        payload = {"is_error": True, "note": "No data available to chart. Please run a SQL query first."}
                    elif not x or not y:
                        payload = {"is_error": True, "note": "Chart requires x and y column names."}
                    else:
                        # Check column names exist in the rows and provide helpful error if not
                        available_cols = list(rows[0].keys()) if rows else []
                        if x not in available_cols or y not in available_cols:
                            payload = {
                                "is_error": True,
                                "note": (
                                    f"Column mismatch: x='{x}' or y='{y}' not found in the data. "
                                    f"Available columns are: {available_cols}. "
                                    f"Please retry local__chart using the exact column names listed."
                                ),
                            }
                        else:
                            from gateway_app.services.attachment_store import attachment_store
                            attach, note = build_chart_attachment(rows, x, y, kind, title, name, color, color_map)

                            if attach is None:
                                payload = {"is_error": True, "note": note}
                            else:
                                file_id = attachment_store.save(attach["bytes"], name, attach["content_type"])
                                import urllib.parse
                                safe_name = urllib.parse.quote(name)
                                chart_url = f"/api/attachments/{file_id}/{safe_name}"

                                enhanced_note = f"{note} Display this in the final response using markdown: ![Chart]({chart_url})"
                                payload = {
                                    "is_error": False,
                                    "note": enhanced_note,
                                    "attached": True,
                                    "name": name,
                                    "url": chart_url,
                                    "markdown": f"![Chart]({chart_url})"
                                }

                                if on_attachment:
                                    if attachments_counter is not None:
                                        attachments_counter[0] += 1
                                    await on_attachment(attach)

                elif fn == "teams__get_chat_summary":
                    payload = {
                        "is_error": True,
                        "text": "Teams integration is not available in this deployment.",
                    }

                else:
                    payload = {"is_error": True, "text": f"Unknown tool '{fn}'."}

            except Exception as e:  # noqa: BLE001
                payload = {"is_error": True, "text": f"Tool '{fn}' failed: {e}"}

            try:
                rows_from_payload = extract_rows_from_payload(payload)
                if rows_from_payload:
                    last_rows = rows_from_payload
            except Exception:
                pass

            out_msgs.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "name": fn,
                    "content": json.dumps(payload, default=str),
                    "ts": _now_iso_ist(),
                }
            )

        if out_msgs:
            self.store.extend(user_id, conversation_id, out_msgs)

        if last_rows:
            self.store.set_state(user_id, conversation_id, "last_rows", last_rows)

        # Return access denied message if any tool was blocked — caller short-circuits LLM
        for msg in out_msgs:
            try:
                p = json.loads(msg.get("content", "{}"))
                if p.get("access_denied"):
                    return p.get("text")
            except Exception:
                pass
        return None

    def _pop_preformatted_table(self, user_id: Optional[str], conversation_id: str) -> Optional[str]:
        """Extract pre-formatted markdown table from latest tool result (wide tables only)."""
        msgs = list(reversed(self.store.get(user_id, conversation_id)))
        for m in msgs:
            if m.get("role") != "tool":
                continue
            try:
                p = json.loads(m.get("content", "{}"))
                table = p.get("_preformatted_table")
                if table:
                    return table
            except Exception:
                pass
            break  # only check the most recent tool message
        return None

    def _pop_chart_url(self, user_id: Optional[str], conversation_id: str) -> Optional[str]:
        """Extract chart URL from the most recent local__chart tool result, if any."""
        msgs = list(reversed(self.store.get(user_id, conversation_id)))
        for m in msgs:
            role = m.get("role")
            # Stop scanning when we hit the most recent user message
            if role == "user":
                break
            if role != "tool":
                continue
            try:
                p = json.loads(m.get("content", "{}"))
                url = p.get("url")
                # Only match chart attachment URLs (PNG files)
                if url and "/api/attachments/" in url and not p.get("is_error"):
                    name = (url.split("/")[-1] or "").lower()
                    if name.endswith(".png") or "chart" in url:
                        return url
            except Exception:
                pass
        return None

    def _pop_export_url(self, user_id: Optional[str], conversation_id: str) -> Optional[str]:
        """Extract CSV/Excel export URL from the most recent local__export tool result, if any."""
        msgs = list(reversed(self.store.get(user_id, conversation_id)))
        for m in msgs:
            role = m.get("role")
            if role == "user":
                break
            if role != "tool":
                continue
            try:
                p = json.loads(m.get("content", "{}"))
                url = p.get("url")
                if url and "/api/attachments/" in url and not p.get("is_error"):
                    name = (url.split("/")[-1] or "").lower()
                    if name.endswith(".csv") or name.endswith(".xlsx") or "export" in url:
                        return url
            except Exception:
                pass
        return None

    def _get_fallback_rows(self, user_id: Optional[str], conversation_id: str) -> Optional[List[Dict[str, Any]]]:
        rows = self.store.get_state(user_id, conversation_id, "last_rows")
        if isinstance(rows, list) and rows and isinstance(rows[0], dict):
            return rows

        msgs = list(reversed(self.store.get(user_id, conversation_id)))
        for m in msgs:
            if m.get("role") != "assistant":
                continue
            text = m.get("content") or ""
            md_rows = parse_markdown_table_to_rows(text)
            if md_rows:
                return md_rows
        return None

    async def run_stream(
        self,
        user_id: Optional[str],
        conversation_id: str,
        user_text: str,
        on_delta: Callable[[str], Awaitable[None]],
        on_start: Optional[Callable[[str], Awaitable[None]]] = None,
        on_done: Optional[Callable[[str], Awaitable[None]]] = None,
        on_attachment: Optional[Callable[[Dict[str, Any]], Awaitable[None]]] = None,
        user_ts: Optional[str] = None,
        db_source: Optional[str] = None,
    ) -> str:
        t0 = time.monotonic()

        llm_planning_ms = 0
        llm_streaming_ms = 0
        llm_ttft_ms: Optional[int] = None

        try:
            # Call-scoped attachment state — a list so it can be mutated by reference
            # across _execute_tool_calls without storing on the shared Agent instance.
            _attachments_counter: List[int] = [0]

            if user_ts is None:
                user_ts = _now_iso_ist()

            # Resolve db_source if not provided (e.g., from Teams Bot)
            if db_source is None:
                from ..api.tab_routes import _read_db_preference
                db_source = _read_db_preference(None, self.store, user_id=user_id)

            from gateway_app.api.schemas import validate_user_message

            try:
                user_text = validate_user_message(user_text)
            except GatewayException as e:
                msg = e.user_message
                self.store.append(user_id, conversation_id, "assistant", msg, ts=_now_iso_ist())
                if on_done:
                    try:
                        await on_done(msg)
                    except Exception as cb_exc:  # noqa: BLE001
                        exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_done_validation"})
                return msg

            new_thread = self.is_new_conversation(user_id, conversation_id)

            if new_thread:
                base_ts = user_ts or _now_iso_ist()
                # Load OpenMetadata schema context based on user's db preference
                try:
                    # Step 1: Discover available tables and schemas (identity-aware)
                    print(f"DEBUG: Agent calling get_schema_context for user_id={user_id}, db_source={db_source}")
                    schema_context = self.om_client.get_schema_context(
                        user_id=user_id,
                        db_source=db_source
                    )
                except Exception as e:
                    exception(e, {"stage": "openmetadata_schema_fetch", "db_source": db_source})
                    schema_context = ""

                if schema_context and schema_context != "No tables available from OpenMetadata.":
                    self.store.append(user_id, conversation_id, "system",
                                      SYSTEM_PROMPT_OPENMETADATA, ts=base_ts)
                    self.store.append(user_id, conversation_id, "system",
                                      f"Database Schema:\n{schema_context}", ts=base_ts)
                    self.store.set_state(user_id, conversation_id, "agent_mode", "v2.0")
                    mode = "v2.0"
                else:
                    self.store.append(user_id, conversation_id, "system", SYSTEM_PROMPT_V1, ts=base_ts)
                    self.store.append(user_id, conversation_id, "system",
                                      SYSTEM_PROMPT_OPENMETADATA_UNAVAILABLE, ts=base_ts)
                    self.store.set_state(user_id, conversation_id, "agent_mode", "v1.0")
                    mode = "v1.0"
            else:
                mode = self.store.get_state(user_id, conversation_id, "agent_mode") or "v1.0"
                
                # Check if db_source has changed mid-conversation
                last_db = self.store.get_state(user_id, conversation_id, "last_db_source")
                if db_source and last_db and db_source != last_db:
                    try:
                        new_schema = self.om_client.get_schema_context(db_source)
                        if new_schema and new_schema != "No tables available from OpenMetadata.":
                            self.store.append(user_id, conversation_id, "system", 
                                              f"SYSTEM NOTE: User has switched data source to {db_source}. "
                                              f"Use the appropriate tool for this source.\n\n"
                                              f"Updated Database Schema:\n{new_schema}", 
                                              ts=user_ts)
                    except Exception:
                        pass

            # Update the last known db_source for next turn
            if db_source:
                self.store.set_state(user_id, conversation_id, "last_db_source", db_source)

            # Inject current time context
            time_note = (
                "System time note: treat "
                f"{user_ts} as the current local time for this conversation in Asia/Kolkata. "
                "When the user asks for the current time, 'now', 'today', 'yesterday', or "
                "similar, answer using this value instead of saying you lack real-time access."
            )
            self.store.append(user_id, conversation_id, "system", time_note, ts=user_ts)
            self.store.append(user_id, conversation_id, "user", user_text, ts=user_ts)

            # Build tool list: execute_sql + local tools (or just local tools in v1.0)
            if mode in ("v2.0", "v3.0"):
                all_tools = _openmetadata_tools() + _local_tools_openai()
            else:
                all_tools = _local_tools_openai()

            merged_tools = self.registry.filter_tools(all_tools, user_id)

            enable_planning = (
                mode in ("v2.0", "v3.0")
                or _wants_export(user_text)
                or _wants_chart(user_text)
                or _wants_history(user_text)
            )

            terminal_msg: Optional[str] = None
            if not enable_planning:
                terminal_msg = None
            if enable_planning:
                max_steps = int(settings.PLAN_MAX_STEPS)
                for _ in range(max_steps):
                    msg, planning_ms = await self._plan_round(user_id, conversation_id, merged_tools)
                    llm_planning_ms += planning_ms
                    tool_calls = msg.get("tool_calls") or []
                    if not tool_calls:
                        break
                    terminal_msg = await self._execute_tool_calls(
                        user_id, conversation_id, tool_calls,
                        on_attachment=on_attachment,
                        attachments_counter=_attachments_counter,
                    )
                    if terminal_msg:
                        break

            self._repair_history(user_id, conversation_id)

            # Short-circuit: access denied — return message directly, skip LLM streaming
            if terminal_msg:
                self.store.append(user_id, conversation_id, "assistant", terminal_msg, ts=_now_iso_ist())
                if on_done:
                    try:
                        await on_done(terminal_msg)
                    except Exception as cb_exc:
                        exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_done_access_denied"})
                return terminal_msg

            if on_start:
                try:
                    await on_start("")
                except Exception as cb_exc:  # noqa: BLE001
                    exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_start"})

            limiter = RateLimiter(min_interval_secs=0.25)
            full_text_parts: List[str] = []

            stream_start = time.monotonic()
            bind_context(llm_called=True, llm_model=self.llm.model_name)
            seen_first_token = False

            async for delta in self.llm.stream_chat(
                messages=_sanitize_messages(self.store.get(user_id, conversation_id)),
                tools=merged_tools,
                tool_choice="none",
                temperature=1,
            ):
                if not seen_first_token:
                    seen_first_token = True
                    llm_ttft_ms = int((time.monotonic() - stream_start) * 1000)
                full_text_parts.append(delta)
                text = sanitize_markdown("".join(full_text_parts))
                if on_delta:
                    try:
                        await limiter.maybe(lambda: on_delta(text))
                    except Exception as cb_exc:  # noqa: BLE001
                        exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_delta"})

            llm_streaming_ms = int((time.monotonic() - stream_start) * 1000)

            final_text = "".join(full_text_parts) or "Done."
            final_text = enforce_output_safety(final_text)

            # ── Guarantee chart image markdown is present in the final text ──────────
            # The LLM may output [Chart](url) (a link) instead of ![Chart](url) (an image).
            # Post-process: find any chart URL from tool results and inject proper image markdown.
            chart_url = self._pop_chart_url(user_id, conversation_id)
            if chart_url:
                import re as _re
                # If the correct image markdown is already present, leave it alone.
                if not _re.search(r'!\[.*?\]\(' + _re.escape(chart_url) + r'\)', final_text):
                    # Replace any [text](chart_url) link with ![Chart](chart_url) image
                    final_text = _re.sub(
                        r'\[([^\]]+)\]\(' + _re.escape(chart_url) + r'\)',
                        f'![\\1]({chart_url})',
                        final_text,
                    )
                    # If image markdown is still not present, append it
                    if not _re.search(r'!\[.*?\]\(' + _re.escape(chart_url) + r'\)', final_text):
                        final_text = final_text.rstrip() + f'\n\n![Chart]({chart_url})'

            # ── Guarantee export download link is present ──────────────────────────
            export_url = self._pop_export_url(user_id, conversation_id)
            if export_url:
                import re as _re
                if export_url not in final_text:
                    final_text = final_text.rstrip() + f'\n\n[Download Excel]({export_url})'

            # Inject pre-formatted wide tables directly (bypasses LLM garbling)
            preformatted = self._pop_preformatted_table(user_id, conversation_id)
            if preformatted:
                # Strip any table the LLM generated (lines starting with |) to avoid duplicates
                lines = [l for l in final_text.split('\n') if not l.strip().startswith('|')]
                final_text = '\n'.join(lines).strip() + "\n\n" + preformatted

            self.store.append(user_id, conversation_id, "assistant", final_text, ts=_now_iso_ist())

            if on_done:
                try:
                    await on_done(final_text)
                except Exception as cb_exc:  # noqa: BLE001
                    exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_done"})

            if _wants_export(user_text) and _attachments_counter[0] == 0 and on_attachment:
                rows = self._get_fallback_rows(user_id, conversation_id)
                if rows:
                    attach, _note = build_csv_attachment(rows, "export.csv")
                    if attach:
                        _attachments_counter[0] += 1
                        try:
                            await on_attachment(attach)
                        except Exception as cb_exc:  # noqa: BLE001
                            exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_attachment_fallback"})

            return final_text

        except GatewayException as exc:
            exception(exc, {"conversation_id": conversation_id, "user_id": user_id})
            msg = exc.user_message
            self.store.append(user_id, conversation_id, "assistant", msg, ts=_now_iso_ist())
            if on_done:
                try:
                    await on_done(msg)
                except Exception as cb_exc:  # noqa: BLE001
                    exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_done_gateway"})
            return msg

        except Exception as e:  # noqa: BLE001
            exception(e, {"conversation_id": conversation_id})
            msg = "The request failed while processing. Please try again."
            self.store.append(user_id, conversation_id, "assistant", msg, ts=_now_iso_ist())
            if on_done:
                try:
                    await on_done(msg)
                except Exception as cb_exc:  # noqa: BLE001
                    exception(cb_exc, {"conversation_id": conversation_id, "stage": "on_done_unexpected"})
            return msg

        finally:
            total_ms = int((time.monotonic() - t0) * 1000)
            llm_total_ms = int(llm_planning_ms + llm_streaming_ms)

            bind_context(
                latency_ms_total=total_ms,
                latency_ms_llm_total=llm_total_ms,
                latency_ms_llm_planning=llm_planning_ms,
                latency_ms_llm_streaming=llm_streaming_ms,
                latency_ms_llm_ttft=llm_ttft_ms,
            )
