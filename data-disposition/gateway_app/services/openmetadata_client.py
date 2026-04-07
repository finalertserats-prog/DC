# gateway_app/services/openmetadata_client.py
"""
Client for OpenMetadata REST API.

Fetches table schemas, column metadata, descriptions, and tags from an
OpenMetadata instance and caches them in Redis for fast retrieval.
The schema context is injected into the LLM system prompt so it can
generate accurate SQL.
"""
from __future__ import annotations

import base64
import json
import logging
import time
import threading
from typing import Any, Dict, List, Optional

import httpx
from redis import Redis

from ..config.settings import settings
from .telemetry import event, exception, trace

logger = logging.getLogger(__name__)

_SCHEMA_CACHE_KEY = "tmcp:om:schema_context"
_TABLES_CACHE_KEY = "tmcp:om:tables"
_TOKEN_CACHE_KEY = "tmcp:om:jwt_token"


class OpenMetadataClient:
    """Talks to the OpenMetadata REST API and caches table/column metadata."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        token: Optional[str] = None,
        redis_url: Optional[str] = None,
    ):
        self._base_url = (base_url or settings.OPENMETADATA_URL).rstrip("/")
        self._static_token = token or settings.OPENMETADATA_TOKEN
        self._email = settings.OPENMETADATA_EMAIL
        self._password = settings.OPENMETADATA_PASSWORD
        self._redis = Redis.from_url(redis_url or settings.REDIS_URL, decode_responses=True)
        self._cache_ttl = int(settings.OPENMETADATA_SCHEMA_CACHE_TTL)
        self._database_fqns = settings.OPENMETADATA_DATABASE_FQNS
        self._timeout = float(settings.OPENMETADATA_TIMEOUT_SECS)
        self._token_lock = threading.Lock()

    # ------------------------------------------------------------------ #
    #  Authentication                                                      #
    # ------------------------------------------------------------------ #

    def _get_token(self) -> Optional[str]:
        """Return a valid JWT token. Uses static token if set, otherwise auto-login."""
        if self._static_token:
            return self._static_token

        if not self._email or not self._password:
            return None

        # Check Redis for a cached JWT
        try:
            cached = self._redis.get(_TOKEN_CACHE_KEY)
            if cached:
                return cached
        except Exception:
            pass

        # Login to OpenMetadata
        with self._token_lock:
            # Double-check after acquiring lock
            try:
                cached = self._redis.get(_TOKEN_CACHE_KEY)
                if cached:
                    return cached
            except Exception:
                pass

            try:
                pwd_b64 = base64.b64encode(self._password.encode()).decode()
                resp = httpx.post(
                    f"{self._base_url}/api/v1/users/login",
                    json={"email": self._email, "password": pwd_b64},
                    timeout=self._timeout,
                )
                resp.raise_for_status()
                token = resp.json().get("accessToken", "")
                if token:
                    # Cache token for 50 minutes (tokens expire in 60 min)
                    try:
                        self._redis.setex(_TOKEN_CACHE_KEY, 3000, token)
                    except Exception:
                        pass
                    trace("om_login_success", {"email": self._email})
                    return token
            except Exception as e:
                exception(e, {"stage": "om_login", "email": self._email})

        return None

    # ------------------------------------------------------------------ #
    #  HTTP helpers                                                        #
    # ------------------------------------------------------------------ #

    def _headers(self) -> Dict[str, str]:
        h: Dict[str, str] = {"Accept": "application/json"}
        token = self._get_token()
        if token:
            h["Authorization"] = f"Bearer {token}"
        return h

    def _get(self, path: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self._base_url}{path}"
        try:
            resp = httpx.get(url, headers=self._headers(), params=params, timeout=self._timeout)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            exception(e, {"url": url, "status": e.response.status_code})
            raise
        except Exception as e:
            exception(e, {"url": url})
            raise

    # ------------------------------------------------------------------ #
    #  Table / column discovery                                            #
    # ------------------------------------------------------------------ #

    def get_tables(self) -> List[Dict[str, Any]]:
        """
        Fetch all tables under the configured database FQN from OpenMetadata.
        Returns a list of table metadata dicts with columns.
        """
        cached = self._redis.get(_TABLES_CACHE_KEY)
        if cached:
            try:
                tables = json.loads(cached)
                trace("om_tables_cache_hit", {"count": len(tables)})
                return tables
            except (json.JSONDecodeError, TypeError):
                pass

        tables = self._fetch_all_tables_from_api()

        if tables:
            try:
                self._redis.setex(
                    _TABLES_CACHE_KEY,
                    self._cache_ttl,
                    json.dumps(tables, default=str),
                )
            except Exception as e:
                logger.warning(f"Failed to cache OM tables: {e}")

        return tables

    def _fetch_all_tables_from_api(self) -> List[Dict[str, Any]]:
        """Fetch tables for all configured FQNs, automatically discovering schemas if needed."""
        all_tables: List[Dict[str, Any]] = []
        for fqn in self._database_fqns:
            # 1. Discover all schemas under this FQN (points to Service, Database, or Schema)
            schemas = self._discover_schemas(fqn)
            trace("om_discovery_result", {"fqn": fqn, "schemas_found": len(schemas)})
            
            # 2. Fetch tables for each schema (Identity-aware + Whitelist)
            whitelist = settings.OPENMETADATA_SCHEMA_WHITELIST
            for schema_fqn in schemas:
                # Check if this schema is in the whitelist (if configured)
                if whitelist:
                    schema_name = schema_fqn.split(".")[-1].lower()
                    if schema_name not in [w.lower() for w in whitelist]:
                        continue
                
                tables = self._fetch_tables_for_fqn(schema_fqn)
                all_tables.extend(tables)

        return all_tables

    def _discover_schemas(self, fqn: str) -> List[str]:
        """
        Recursively find all DatabaseSchema FQNs under a given Service, Database, or Schema FQN.
        """
        parts = fqn.split(".")
        depth = len(parts)

        if depth >= 3:
            # This is already a DatabaseSchema (or a Table, which we treat as Schema for fetching)
            return [fqn]

        if depth == 1:
            # Service level -> Find all databases
            try:
                data = self._get("/api/v1/databases", params={"service": fqn})
                db_fqns = [db.get("fullyQualifiedName") for db in data.get("data", []) if db.get("fullyQualifiedName")]
                all_schema_fqns = []
                for db_fqn in db_fqns:
                    all_schema_fqns.extend(self._get_schemas_in_db(db_fqn))
                return all_schema_fqns
            except Exception as e:
                exception(e, {"stage": "om_discover_db", "service": fqn})
                return []

        if depth == 2:
            # Database level -> Find all schemas
            return self._get_schemas_in_db(fqn)

        return []

    def _get_schemas_in_db(self, db_fqn: str) -> List[str]:
        """Fetch all DatabaseSchema FQNs within a Database FQN, handling pagination."""
        schemas = []
        limit = 100
        offset = 0
        try:
            while True:
                params = {"database": db_fqn, "limit": limit, "offset": offset}
                data = self._get("/api/v1/databaseSchemas", params=params)
                page = [s.get("fullyQualifiedName") for s in data.get("data", []) if s.get("fullyQualifiedName")]
                schemas.extend(page)
                if len(page) < limit:
                    break
                offset += limit
            return schemas
        except Exception as e:
            exception(e, {"stage": "om_discover_schemas", "database": db_fqn})
            return []

    def _fetch_tables_for_fqn(self, fqn: str) -> List[Dict[str, Any]]:
        """Call OpenMetadata API to list tables and their columns for a specific FQN."""
        t0 = time.monotonic()
        tables_in_fqn: List[Dict[str, Any]] = []

        try:
            # Search tables belonging to this database schema
            params: Dict[str, Any] = {
                "databaseSchema": fqn,
                "limit": 100,
                "fields": "columns,tags,tableConstraints",
            }
            data = self._get("/api/v1/tables", params=params)
            raw_tables = data.get("data", [])

            for t in raw_tables:
                columns: List[Dict[str, Any]] = []
                for c in t.get("columns", []):
                    col_info: Dict[str, Any] = {
                        "name": c.get("name"),
                        "dataType": c.get("dataType"),
                        "description": c.get("description", ""),
                    }
                    # Include tags if present
                    tags = c.get("tags", [])
                    if tags:
                        col_info["tags"] = [tag.get("tagFQN", "") for tag in tags]
                    columns.append(col_info)

                table_info: Dict[str, Any] = {
                    "name": t.get("name"),
                    "fullyQualifiedName": t.get("fullyQualifiedName", ""),
                    "description": t.get("description", ""),
                    "tableType": t.get("tableType", "Regular"),
                    "columns": columns,
                    "databaseFQN": fqn,
                }
                # Include table tags
                table_tags = t.get("tags", [])
                if table_tags:
                    table_info["tags"] = [tag.get("tagFQN", "") for tag in table_tags]

                tables_in_fqn.append(table_info)

            latency = int((time.monotonic() - t0) * 1000)
            trace("om_tables_fetched", {"fqn": fqn, "count": len(tables_in_fqn), "latency_ms": latency})
            event("openmetadata.discovery", {"fqn": fqn, "tables": len(tables_in_fqn), "latency_ms": latency})

        except Exception as e:
            exception(e, {"stage": "om_fetch_tables", "database": fqn})

        return tables_in_fqn

    def get_table_by_name(self, table_name: str) -> Optional[Dict[str, Any]]:
        """Fetch a single table's metadata by its name."""
        tables = self.get_tables()
        for t in tables:
            if t["name"].lower() == table_name.lower():
                return t
        return None

    # ------------------------------------------------------------------ #
    #  Schema context builder (for LLM system prompt)                      #
    # ------------------------------------------------------------------ #

    def get_schema_context(self, user_id: Optional[str] = None, db_source: Optional[str] = None) -> str:
        """
        Build a formatted string describing available tables grouped by source.
        If db_source is specified (Snowflake or StarRocks), only return schema for that source.
        This is injected into the LLM system prompt.
        """
        # Build cache key based on db_source to allow per-user caching
        cache_key = f"{_SCHEMA_CACHE_KEY}:{db_source or 'all'}"
        cached = self._redis.get(cache_key)
        if cached:
            trace("om_schema_context_cache_hit", {"db_source": db_source})
            return cached

        tables = self.get_tables()
        if not tables:
            return "No tables available from OpenMetadata."

        # Group tables by their source service (Snowflake vs StarRocks)
        snowflake_tables = [t for t in tables if "starrocks" not in t.get("databaseFQN", "").lower()]
        starrocks_tables = [t for t in tables if "starrocks" in t.get("databaseFQN", "").lower()]

        # Filter based on user's db preference if specified
        if db_source:
            db_source_lower = db_source.lower()
            if "snowflake" in db_source_lower:
                # User selected Snowflake - only show Snowflake tables
                snowflake_tables = snowflake_tables
                starrocks_tables = []
            elif "starrocks" in db_source_lower:
                # User selected StarRocks - only show StarRocks tables
                snowflake_tables = []

        lines: List[str] = []
        
        # Add header with current connection info
        if db_source:
            lines.append(f"--- CURRENT DATABASE: {db_source.upper()} ---")
            lines.append("")

        # Only show Snowflake section if there are tables or user selected Snowflake
        if snowflake_tables or (db_source and "snowflake" in db_source.lower()):
            lines.append("--- SNOWFLAKE TABLES ---")
            lines.append("To query these tables, use the 'execute_sql' tool.")

            if not snowflake_tables:
                lines.append("No Snowflake tables found.")
            else:
                for t in snowflake_tables:
                    lines.append(self._format_table_for_prompt(t))

        # Only show StarRocks section if there are tables or user selected StarRocks
        if starrocks_tables or (db_source and "starrocks" in db_source.lower()):
            lines.append("")
            lines.append("--- STARROCKS TABLES ---")
            lines.append("To query these tables, use the 'execute_starrocks_sql' tool.")

            if not starrocks_tables:
                lines.append("No StarRocks tables found.")
            else:
                # Group StarRocks tables by database (Schema in OM)
                by_db: Dict[str, List[Dict[str, Any]]] = {}
                for t in starrocks_tables:
                    db_name = t.get("databaseFQN", "unknown").split(".")[-1]
                    if db_name not in by_db:
                        by_db[db_name] = []
                    by_db[db_name].append(t)

                for db_name, db_tables in by_db.items():
                    lines.append(f"\nDATABASE: {db_name}")
                    lines.append(
                        f"To query this database in StarRocks, prefix table names with '{db_name}.' "
                        "Do not use USE; only a single SQL statement is allowed."
                    )
                    for t in db_tables:
                        lines.append(self._format_table_for_prompt(t))

        schema_text = "\n".join(lines)

        # Safety Cap: Truncate if context is too long (approx 4 chars per token)
        # GPT-4o-mini window is 128k, but we should leave plenty of room for history.
        # Max 64,000 tokens (256,000 chars) for schema context.
        MAX_CHARS = 256000
        if len(schema_text) > MAX_CHARS:
            logger.warning(f"Schema context too long ({len(schema_text)} chars). Truncating to {MAX_CHARS} chars.")
            schema_text = schema_text[:MAX_CHARS] + "\n... [SCHEMA TRUNCATED FOR CONTEXT LIMITS]"

        try:
            self._redis.setex(cache_key, self._cache_ttl, schema_text)
        except Exception as e:
            logger.warning(f"Failed to cache schema context: {e}")

        return schema_text

    def _format_table_for_prompt(self, t: Dict[str, Any]) -> str:
        """Helper to format a single table for the prompt."""
        parts = [f"TABLE: {t['name']}"]
        desc = t.get("description")
        if desc:
            parts.append(f"Description: {desc}")
        
        parts.append("Columns:")
        for c in t.get("columns", []):
            line = f"  - {c['name']} ({c.get('dataType', 'UNKNOWN')})"
            if c.get("description"):
                line += f": {c['description']}"
            parts.append(line)
        parts.append("")
        return "\n".join(parts)

    def invalidate_cache(self) -> None:
        """Clear all cached OpenMetadata data."""
        self._redis.delete(_SCHEMA_CACHE_KEY)
        self._redis.delete(_TABLES_CACHE_KEY)
        trace("om_cache_invalidated", {})

    # ------------------------------------------------------------------ #
    #  Health check                                                        #
    # ------------------------------------------------------------------ #

    def is_healthy(self) -> bool:
        """Check if OpenMetadata is reachable."""
        try:
            resp = httpx.get(
                f"{self._base_url}/api/v1/system/version",
                headers=self._headers(),
                timeout=5.0,
            )
            return resp.status_code == 200
        except Exception:
            return False
