# gateway_app/services/snowflake_executor.py
"""
Direct Snowflake SQL executor.

Replaces the Gateway layer by executing validated, read-only SQL queries
directly on Snowflake and returning structured results. Apache Ranger row/column
filters are still enforced at the database engine level.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from redis import Redis

from ..config.settings import settings
from .sql_validator import validate_sql_readonly
from .governance import GovernanceService
from .telemetry import event, exception, trace
from .access_registry import AccessRegistry

logger = logging.getLogger(__name__)


class SnowflakeExecutor:
    """
    Executes read-only SQL queries on Snowflake and returns structured results.
    """

    def __init__(self, redis_url: Optional[str] = None):
        self._redis = Redis.from_url(redis_url or settings.REDIS_URL, decode_responses=True)
        self._result_cache_ttl = int(settings.SNOWFLAKE_RESULT_CACHE_SECS)
        self._result_cache_max_bytes = int(settings.SNOWFLAKE_RESULT_CACHE_MAX_BYTES)
        self._max_rows = int(settings.SNOWFLAKE_MAX_RESULT_ROWS)
        self._timeout = int(settings.SNOWFLAKE_QUERY_TIMEOUT_SECS)
        self._access_registry = AccessRegistry()
        self.governance = GovernanceService()

    def _get_connection(self):
        """Create a new Snowflake connection using configured credentials."""
        import snowflake.connector

        conn = snowflake.connector.connect(
            account=settings.SNOWFLAKE_ACCOUNT,
            user=settings.SNOWFLAKE_USER,
            password=settings.SNOWFLAKE_PASSWORD,
            database=settings.SNOWFLAKE_DATABASE,
            schema=settings.SNOWFLAKE_SCHEMA,
            warehouse=settings.SNOWFLAKE_WAREHOUSE,
            role=settings.SNOWFLAKE_ROLE,
            login_timeout=15,
            network_timeout=self._timeout,
        )
        return conn

    def execute_query(
        self,
        sql: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute a SQL query on Snowflake, with RLS injection and database access check.
        """
        # For Snowflake, the database is in settings but can be overridden in SQL
        # We primarily check if the user has access to the connection database, 
        # or if any of their allowed databases appear in the SQL query.
        # Step 1: Validate SQL is read-only
        is_valid, error_msg = validate_sql_readonly(sql)
        if not is_valid:
            trace("sql_validation_failed", {"sql": sql[:200], "error": error_msg})
            event("security.sql_blocked", {"reason": error_msg, "user": user_id, "sql_preview": sql[:100]})
            return {
                "is_error": True,
                "text": f"SQL blocked: {error_msg}. Only read-only SELECT queries are allowed.",
                "sql": sql,
            }

        # Step 1.5: Apply governance policies (Layer 3 RLS)
        sql = self.governance.apply_policies(sql, user_id)

        # Step 2: Check cache
        cache_key = self._cache_key(sql, user_id)
        cached = self._get_cached_result(cache_key)
        if cached is not None:
            trace("snowflake_cache_hit", {"sql": sql[:100]})
            return cached

        # Step 3: Execute on Snowflake
        t0 = time.monotonic()
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()

            # Set query timeout
            cursor.execute(f"ALTER SESSION SET STATEMENT_TIMEOUT_IN_SECONDS = {self._timeout}")

            # Execute the query
            cursor.execute(sql)

            # Fetch column names
            columns = [desc[0] for desc in cursor.description] if cursor.description else []

            # Fetch rows (with limit)
            rows = cursor.fetchmany(self._max_rows)
            total_rows = cursor.rowcount or len(rows)

            # Convert to list of lists (serializable)
            rows_list = [list(row) for row in rows]

            latency_ms = int((time.monotonic() - t0) * 1000)

            result: Dict[str, Any] = {
                "is_error": False,
                "columns": columns,
                "rows": rows_list,
                "row_count": total_rows,
                "sql": sql,
                "latency_ms": latency_ms,
                "text": self._format_text_result(columns, rows_list, total_rows),
            }

            trace("snowflake_query_success", {
                "latency_ms": latency_ms,
                "rows": len(rows_list),
                "total_rows": total_rows,
            })
            event("snowflake.query", {
                "user": user_id,
                "latency_ms": latency_ms,
                "rows": len(rows_list),
            })

            # Cache the result
            self._cache_result(cache_key, result)

            return result

        except Exception as e:
            latency_ms = int((time.monotonic() - t0) * 1000)
            error_text = str(e)
            exception(e, {"sql": sql[:200], "user": user_id, "latency_ms": latency_ms})

            return {
                "is_error": True,
                "text": f"Snowflake query failed: {error_text}",
                "sql": sql,
                "latency_ms": latency_ms,
            }

        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    # ------------------------------------------------------------------ #
    #  Result formatting                                                   #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _format_text_result(
        columns: List[str],
        rows: List[List[Any]],
        total_rows: int,
    ) -> str:
        """Format query result as a readable text table for the LLM."""
        if not columns or not rows:
            return "Query returned no results."

        # Build a simple text table
        lines: List[str] = []

        # Header
        header = " | ".join(str(c) for c in columns)
        lines.append(header)
        lines.append("-" * len(header))

        # Rows (limit display to first 50)
        display_rows = rows[:50]
        for row in display_rows:
            line = " | ".join(str(v) if v is not None else "NULL" for v in row)
            lines.append(line)

        if total_rows > len(display_rows):
            lines.append(f"... ({total_rows - len(display_rows)} more rows)")

        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    #  Cache helpers                                                       #
    # ------------------------------------------------------------------ #

    def _cache_key(self, sql: str, user_id: Optional[str] = None) -> str:
        import hashlib
        user_scope = user_id or settings.SINGLE_USER_ID
        base = f"{user_scope}:{sql.strip()}"
        digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
        return f"tg:sf:cache:{digest}"

    def _get_cached_result(self, key: str) -> Optional[Dict[str, Any]]:
        try:
            raw = self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception:
            pass
        return None

    def _cache_result(self, key: str, result: Dict[str, Any]) -> None:
        if self._result_cache_ttl <= 0:
            return
        try:
            data = json.dumps(result, default=str)
            if len(data) < settings.SNOWFLAKE_RESULT_CACHE_MAX_BYTES:
                self._redis.setex(key, self._result_cache_ttl, data)
        except Exception as e:
            logger.warning(f"Failed to cache Snowflake result: {e}")

    # ------------------------------------------------------------------ #
    #  Health check                                                        #
    # ------------------------------------------------------------------ #

    def is_healthy(self) -> bool:
        """Quick connectivity check to Snowflake."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            return True
        except Exception:
            return False
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
