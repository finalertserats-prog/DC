# gateway_app/config/settings.py
from __future__ import annotations

import os
import json
from dataclasses import dataclass, field
from typing import Dict, Set, Optional
from dotenv import load_dotenv

PKG_ROOT = os.path.dirname(os.path.dirname(__file__))
PROJECT_ROOT = os.path.dirname(PKG_ROOT)
ENV_PATH = os.path.join(PROJECT_ROOT, ".env")

if os.path.exists(ENV_PATH):
    load_dotenv(ENV_PATH, override=True)


def _getenv(name: str, default: Optional[str] = None) -> Optional[str]:
    v = os.getenv(name)
    return v if v is not None and v != "" else default


def _parse_csv_set(raw: str) -> Set[str]:
    out: Set[str] = set()
    raw = (raw or "").strip()
    if not raw:
        return out
    for item in raw.split(","):
        item = item.strip()
        if item:
            out.add(item)
    return out


def _parse_aad_to_email(raw: str) -> Dict[str, str]:
    """Parse AAD_TO_EMAIL JSON: {"aad-id": "email@example.com"}"""
    out: Dict[str, str] = {}
    raw = (raw or "").strip()
    if not raw:
        return out
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            for aad_id, email in parsed.items():
                if isinstance(email, str) and email.strip():
                    out[aad_id] = email.strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return out


def _parse_access_rules(raw: str) -> Dict[str, Set[str]]:
    """Parse ACCESS_RULES JSON: {"email": ["tool1", "tool2"]}"""
    out: Dict[str, Set[str]] = {}
    raw = (raw or "").strip()
    if not raw:
        return out
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            for ident, tools in parsed.items():
                if isinstance(tools, list):
                    out[ident] = set(str(t).strip() for t in tools if t)
    except (json.JSONDecodeError, TypeError):
        pass
    return out


def _parse_ranger_policies(raw: str) -> Dict[str, Dict[str, str]]:
    """Parse RANGER_POLICIES JSON: {"email": {"table": "filter_clause"}}"""
    out: Dict[str, Dict[str, str]] = {}
    raw = (raw or "").strip()
    if not raw:
        return out
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            for ident, policies in parsed.items():
                if isinstance(policies, dict):
                    out[ident] = {str(k).lower(): str(v) for k, v in policies.items() if k and v}
    except (json.JSONDecodeError, TypeError):
        pass
    return out
def _parse_database_rules(raw: str) -> Dict[str, Set[str]]:
    """Parse DATABASE_RULES JSON: {"email": ["db1", "db2"]}"""
    out: Dict[str, Set[str]] = {}
    raw = (raw or "").strip()
    if not raw:
        return out
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            for ident, databases in parsed.items():
                if isinstance(databases, list):
                    out[ident] = set(str(db).strip().lower() for db in databases if db)
    except (json.JSONDecodeError, TypeError):
        pass
    return out


@dataclass
class Settings:
    # ── Bot Framework / Teams ──
    MICROSOFT_BOT_ID: Optional[str] = field(default_factory=lambda: _getenv("MICROSOFT_BOT_ID"))
    MICROSOFT_BOT_PASSWORD: Optional[str] = field(default_factory=lambda: _getenv("MICROSOFT_BOT_PASSWORD"))
    MICROSOFT_APP_TENANT_ID: Optional[str] = field(default_factory=lambda: _getenv("MICROSOFT_APP_TENANT_ID"))

    # ── LLM ──
    LLM_BASE_URL: Optional[str] = field(default_factory=lambda: _getenv("LLM_BASE_URL"))
    LLM_API_KEY: Optional[str] = field(default_factory=lambda: _getenv("LLM_API_KEY"))
    LLM_MODEL: str = field(default_factory=lambda: _getenv("LLM_MODEL", "gpt-4o-mini"))
    LLM_PROVIDER: str = field(default_factory=lambda: _getenv("LLM_PROVIDER", "openai-compatible"))
    LLM_TIMEOUT_SECS: int = field(default_factory=lambda: int(_getenv("LLM_TIMEOUT_SECS", "60")))
    LLM_MAX_OUTPUT_TOKENS: int = field(default_factory=lambda: int(_getenv("LLM_MAX_OUTPUT_TOKENS", "2000")))
    TARGET_LATENCY_MS: int = field(default_factory=lambda: int(_getenv("TARGET_LATENCY_MS", "3500")))
    LLM_HEALTHCHECK_ENABLED: bool = field(
        default_factory=lambda: _getenv("LLM_HEALTHCHECK_ENABLED", "false").lower() in ("1", "true", "yes")
    )

    # ── Planner / runtime limits ──
    PLAN_MAX_STEPS: int = field(default_factory=lambda: int(_getenv("PLAN_MAX_STEPS", "4")))
    PLAN_MAX_CONCURRENCY: int = field(default_factory=lambda: int(_getenv("PLAN_MAX_CONCURRENCY", "2")))
    TOOL_TIMEOUT_SECS: int = field(default_factory=lambda: int(_getenv("TOOL_TIMEOUT_SECS", "30")))
    RETRY_ON_TOOL_ERROR: int = field(default_factory=lambda: int(_getenv("RETRY_ON_TOOL_ERROR", "1")))

    # ── Redis / history ──
    REDIS_URL: str = field(default_factory=lambda: _getenv("REDIS_URL", "redis://localhost:6379/0"))
    HISTORY_MAX_TURNS: int = field(default_factory=lambda: int(_getenv("HISTORY_MAX_TURNS", "30")))
    HISTORY_MAX_TOKENS: int = field(default_factory=lambda: int(_getenv("HISTORY_MAX_TOKENS", "8000")))
    HISTORY_TTL_SECS: int = field(default_factory=lambda: int(_getenv("HISTORY_TTL_SECS", "2592000")))  # 30 days
    SINGLE_USER_ID: str = field(default_factory=lambda: _getenv("SINGLE_USER_ID", "default"))

    # ── Attachments / Exports ──
    ATTACH_MAX_INLINE_BYTES: int = field(default_factory=lambda: int(_getenv("ATTACH_MAX_INLINE_BYTES", "900000")))
    CSV_ROW_LIMIT: int = field(default_factory=lambda: int(_getenv("CSV_ROW_LIMIT", "50000")))
    ATTACH_DATA_URLS: bool = field(default_factory=lambda: _getenv("ATTACH_DATA_URLS", "true").lower() in ("1", "true", "yes"))
    ATTACH_ALLOWED_EXTENSIONS: str = field(default_factory=lambda: str(_getenv("ATTACH_ALLOWED_EXTENSIONS", "pdf,json,md")))

    # ── Server ──
    HOST: str = field(default_factory=lambda: _getenv("TEAMS_GATEWAY_HOST", "0.0.0.0"))
    PORT: int = field(default_factory=lambda: int(_getenv("TEAMS_GATEWAY_PORT", "3978")))

    # ── Rate Limiting ──
    RATE_LIMIT_ENABLED: bool = field(default_factory=lambda: _getenv("RATE_LIMIT_ENABLED", "true").lower() in ("1", "true", "yes"))
    RATE_LIMIT_PER_USER_PER_MINUTE: int = field(default_factory=lambda: int(_getenv("RATE_LIMIT_PER_USER_PER_MINUTE", "100")))
    RATE_LIMIT_PER_CONVERSATION_PER_MINUTE: int = field(default_factory=lambda: int(_getenv("RATE_LIMIT_PER_CONVERSATION_PER_MINUTE", "50")))
    RATE_LIMIT_PER_IP_PER_MINUTE: int = field(default_factory=lambda: int(_getenv("RATE_LIMIT_PER_IP_PER_MINUTE", "200")))
    RATE_LIMIT_STORAGE_URI: Optional[str] = field(default_factory=lambda: _getenv("RATE_LIMIT_STORAGE_URI"))
    TRUSTED_PROXY_IPS_RAW: str = field(default_factory=lambda: _getenv("TRUSTED_PROXY_IPS", ""))

    # ── Audit Logging ──
    AUDIT_LOG_RETENTION_DAYS: int = field(default_factory=lambda: int(_getenv("AUDIT_LOG_RETENTION_DAYS", "90")))

    # ── Circuit Breaker ──
    CIRCUIT_BREAKER_FAILURE_THRESHOLD: int = field(default_factory=lambda: int(_getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5")))
    CIRCUIT_BREAKER_TIMEOUT_SECONDS: float = field(default_factory=lambda: float(_getenv("CIRCUIT_BREAKER_TIMEOUT_SECONDS", "60.0")))
    CIRCUIT_BREAKER_SUCCESS_THRESHOLD: int = field(default_factory=lambda: int(_getenv("CIRCUIT_BREAKER_SUCCESS_THRESHOLD", "1")))

    # ── AAD → Email mapping ──
    ACCESS_RULES_RAW: str = field(default_factory=lambda: _getenv("ACCESS_RULES", "{}"))
    DATABASE_RULES_RAW: str = field(default_factory=lambda: _getenv("DATABASE_RULES", "{}"))
    RANGER_POLICIES_RAW: str = field(default_factory=lambda: _getenv("RANGER_POLICIES", "{}"))
    AAD_TO_EMAIL_RAW: str = field(default_factory=lambda: _getenv("AAD_TO_EMAIL", "{}"))

    # ── OpenMetadata ──
    OPENMETADATA_URL: str = field(default_factory=lambda: _getenv("OPENMETADATA_URL", "http://localhost:8585"))
    OPENMETADATA_EMAIL: Optional[str] = field(default_factory=lambda: _getenv("OPENMETADATA_EMAIL"))
    OPENMETADATA_PASSWORD: Optional[str] = field(default_factory=lambda: _getenv("OPENMETADATA_PASSWORD"))
    OPENMETADATA_TOKEN: Optional[str] = field(default_factory=lambda: _getenv("OPENMETADATA_TOKEN"))
    OPENMETADATA_DATABASE_FQN_RAW: str = field(default_factory=lambda: _getenv("OPENMETADATA_DATABASE_FQN", "ONSEMI.LABIQ"))
    OPENMETADATA_SCHEMA_WHITELIST_RAW: str = field(
        default_factory=lambda: _getenv("OPENMETADATA_SCHEMA_WHITELIST") or _getenv("SERVICE_WHITELIST", "")
    )
    OPENMETADATA_SCHEMA_CACHE_TTL: int = field(default_factory=lambda: int(_getenv("OPENMETADATA_SCHEMA_CACHE_TTL", "86400")))
    OPENMETADATA_TIMEOUT_SECS: int = field(default_factory=lambda: int(_getenv("OPENMETADATA_TIMEOUT_SECS", "15")))
    OPENMETADATA_AUTO_ENRICH: bool = field(
        default_factory=lambda: _getenv("OPENMETADATA_AUTO_ENRICH", "false").lower() in ("1", "true", "yes")
    )
    OPENMETADATA_ENRICH_INTERVAL_HOURS: int = field(
        default_factory=lambda: int(_getenv("OPENMETADATA_ENRICH_INTERVAL_HOURS", "24"))
    )

    # ── Snowflake (direct connection) ──
    SNOWFLAKE_ACCOUNT: str = field(default_factory=lambda: _getenv("SNOWFLAKE_ACCOUNT", ""))
    SNOWFLAKE_USER: str = field(default_factory=lambda: _getenv("SNOWFLAKE_USER", ""))
    SNOWFLAKE_PASSWORD: str = field(default_factory=lambda: _getenv("SNOWFLAKE_PASSWORD", ""))
    SNOWFLAKE_DATABASE: str = field(default_factory=lambda: _getenv("SNOWFLAKE_DATABASE", "ONSEMI"))
    SNOWFLAKE_SCHEMA: str = field(default_factory=lambda: _getenv("SNOWFLAKE_SCHEMA", "LABIQ"))
    SNOWFLAKE_WAREHOUSE: str = field(default_factory=lambda: _getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH"))
    SNOWFLAKE_ROLE: str = field(default_factory=lambda: _getenv("SNOWFLAKE_ROLE", ""))
    SNOWFLAKE_QUERY_TIMEOUT_SECS: int = field(default_factory=lambda: int(_getenv("SNOWFLAKE_QUERY_TIMEOUT_SECS", "60")))
    SNOWFLAKE_MAX_RESULT_ROWS: int = field(default_factory=lambda: int(_getenv("SNOWFLAKE_MAX_RESULT_ROWS", "1000")))
    SNOWFLAKE_RESULT_CACHE_SECS: int = field(default_factory=lambda: int(_getenv("SNOWFLAKE_RESULT_CACHE_SECS", "30")))
    SNOWFLAKE_RESULT_CACHE_MAX_BYTES: int = field(default_factory=lambda: int(_getenv("SNOWFLAKE_RESULT_CACHE_MAX_BYTES", "1000000")))

    # ── StarRocks (direct connection) ──
    STARROCKS_HOST: str = field(default_factory=lambda: _getenv("STARROCKS_HOST", ""))
    STARROCKS_PORT: int = field(default_factory=lambda: int(_getenv("STARROCKS_PORT", "9030")))
    STARROCKS_USER: str = field(default_factory=lambda: _getenv("STARROCKS_USER", ""))  # unused, kept for compatibility
    STARROCKS_PASSWORD: str = field(default_factory=lambda: _getenv("STARROCKS_PASSWORD", ""))  # unused, kept for compatibility
    STARROCKS_DATABASE: str = field(default_factory=lambda: _getenv("STARROCKS_DATABASE", ""))
    STARROCKS_QUERY_TIMEOUT_SECS: int = field(default_factory=lambda: int(_getenv("STARROCKS_QUERY_TIMEOUT_SECS", "60")))
    STARROCKS_MAX_RESULT_ROWS: int = field(default_factory=lambda: int(_getenv("STARROCKS_MAX_RESULT_ROWS", "1000")))
    STARROCKS_RESULT_CACHE_SECS: int = field(default_factory=lambda: int(_getenv("STARROCKS_RESULT_CACHE_SECS", "300")))
    STARROCKS_RESULT_CACHE_MAX_BYTES: int = field(default_factory=lambda: int(_getenv("STARROCKS_RESULT_CACHE_MAX_BYTES", "1000000")))

    # ── Require mention in group chats ──
    REQUIRE_MENTION_IN_GROUPS: bool = field(
        default_factory=lambda: _getenv("REQUIRE_MENTION_IN_GROUPS", "true").lower() in ("1", "true", "yes")
    )

    # ── Graph / Teams history ──
    GRAPH_TENANT_ID: Optional[str] = field(default_factory=lambda: _getenv("GRAPH_TENANT_ID"))
    GRAPH_CLIENT_ID: Optional[str] = field(default_factory=lambda: _getenv("GRAPH_CLIENT_ID"))
    GRAPH_CLIENT_SECRET: Optional[str] = field(default_factory=lambda: _getenv("GRAPH_CLIENT_SECRET"))
    GRAPH_BASE_URL: str = field(default_factory=lambda: str(_getenv("GRAPH_BASE_URL", "https://graph.microsoft.com/v1.0")))
    GRAPH_TIMEOUT_SECS: int = field(default_factory=lambda: int(_getenv("GRAPH_TIMEOUT_SECS", "20")))
    GRAPH_CHAT_SUMMARY_MAX_MESSAGES: int = field(default_factory=lambda: int(_getenv("GRAPH_CHAT_SUMMARY_MAX_MESSAGES", "500")))

    # ── Request / body & schema validation limits ──
    MAX_USER_MESSAGE_LENGTH: int = field(default_factory=lambda: _getenv("MAX_USER_MESSAGE_LENGTH", "10000"))
    MAX_TOOL_NAME_LENGTH: int = field(default_factory=lambda: _getenv("MAX_TOOL_NAME_LENGTH", "200"))
    MAX_TOOL_ARGUMENTS_SIZE: int = field(default_factory=lambda: _getenv("MAX_TOOL_ARGUMENTS_SIZE", "50000"))
    MAX_REQUEST_BODY_SIZE: int = field(default_factory=lambda: _getenv("MAX_REQUEST_BODY_SIZE", "200000"))

    # ── Derived fields ──
    AAD_TO_EMAIL: Dict[str, str] = field(init=False)
    ACCESS_RULES: Dict[str, Set[str]] = field(init=False)
    DATABASE_RULES: Dict[str, Set[str]] = field(init=False)
    RANGER_POLICIES: Dict[str, Dict[str, str]] = field(init=False)
    TRUSTED_PROXY_IPS: Set[str] = field(init=False)
    OPENMETADATA_DATABASE_FQNS: Set[str] = field(init=False)
    OPENMETADATA_SCHEMA_WHITELIST: Set[str] = field(init=False)

    def __post_init__(self):
        self.AAD_TO_EMAIL = _parse_aad_to_email(self.AAD_TO_EMAIL_RAW)
        self.ACCESS_RULES = _parse_access_rules(self.ACCESS_RULES_RAW)
        self.DATABASE_RULES = _parse_database_rules(self.DATABASE_RULES_RAW)
        self.RANGER_POLICIES = _parse_ranger_policies(self.RANGER_POLICIES_RAW)
        self.TRUSTED_PROXY_IPS = _parse_csv_set(self.TRUSTED_PROXY_IPS_RAW)
        self.OPENMETADATA_DATABASE_FQNS = _parse_csv_set(self.OPENMETADATA_DATABASE_FQN_RAW)
        self.OPENMETADATA_SCHEMA_WHITELIST = _parse_csv_set(self.OPENMETADATA_SCHEMA_WHITELIST_RAW)


settings = Settings()
