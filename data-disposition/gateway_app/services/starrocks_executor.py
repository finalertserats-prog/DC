# gateway_app/services/starrocks_executor.py
"""
Replaces the Gateway layer by executing validated, read-only SQL queries
directly on StarRocks and returning structured results. Apache Ranger row/column
filters are still enforced at the database engine level.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

from redis import Redis

from ..config.settings import settings
from .sql_validator import validate_sql_readonly
from .governance import GovernanceService
from .telemetry import event, exception, trace
from .access_registry import AccessRegistry

logger = logging.getLogger(__name__)


class StarRocksExecutor:
    """
    Executes read-only SQL queries on StarRocks and returns structured results.
    """

    def __init__(self, redis_url: Optional[str] = None):
        self._redis = Redis.from_url(redis_url or settings.REDIS_URL, decode_responses=True)
        self._result_cache_ttl = int(settings.STARROCKS_RESULT_CACHE_SECS)
        self._result_cache_max_bytes = int(settings.STARROCKS_RESULT_CACHE_MAX_BYTES)
        self._max_rows = int(settings.STARROCKS_MAX_RESULT_ROWS)
        self._timeout = int(settings.STARROCKS_QUERY_TIMEOUT_SECS)
        self.governance = GovernanceService()
        self._access_registry = AccessRegistry()

    def _get_connection(self, db_user: Optional[str] = None, database: Optional[str] = None):
        """Create a StarRocks connection as the mapped user (passwordless) or service account fallback."""
        import pymysql

        db_name = database if database is not None else settings.STARROCKS_DATABASE
        username = db_user or settings.STARROCKS_USER
        password = "" if db_user else settings.STARROCKS_PASSWORD

        conn_kwargs = dict(
            host=settings.STARROCKS_HOST,
            port=settings.STARROCKS_PORT,
            user=username,
            password=password,
            connect_timeout=15,
            read_timeout=self._timeout,
            write_timeout=self._timeout,
        )
        if db_name:
            conn_kwargs["database"] = db_name
        conn = pymysql.connect(**conn_kwargs)
        return conn

    def execute_query(
        self,
        sql: str,
        user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Execute a SQL query on StarRocks, with RLS injection and database access check."""
        
        # For StarRocks, queries often specify the schema/db directly (e.g. codeiq_service.table)
        # We ensure the user is either authorized for the default connection DB, OR
        # their explicitly authorized DBs are mentioned in the SQL.
        # Step 1: Validate SQL is read-only
        is_valid, error_msg = validate_sql_readonly(sql)
        if not is_valid:
            trace("sql_validation_failed_starrocks", {"sql": sql[:200], "error": error_msg})
            event("security.sql_blocked_starrocks", {"reason": error_msg, "user": user_id, "sql_preview": sql[:100]})
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
            trace("starrocks_cache_hit", {"sql": sql[:100]})
            return cached

        # Step 3: Execute on StarRocks
        t0 = time.monotonic()
        conn = None
        # Resolve mapped DB user: mahesh.k@techsophy.com → mahesh.k_at_techsophy.com
        db_user = self._access_registry.get_database_user(user_id) if user_id else None
        logger.info("StarRocks connecting as user: %s", db_user or settings.STARROCKS_USER)
        try:
            try:
                conn = self._get_connection(db_user=db_user)
            except Exception as e:
                msg = str(e)
                if "Unknown database" in msg:
                    logger.warning("StarRocks database '%s' not found; retrying without default database", settings.STARROCKS_DATABASE)
                    conn = self._get_connection(db_user=db_user, database="")
                elif any(k in msg for k in ("Access denied", "Unknown user", "not exist", "authentication")):
                    logger.warning("StarRocks access denied for user '%s': %s", db_user, msg)
                    db_name = settings.STARROCKS_DATABASE or "StarRocks"
                    return {
                        "is_error": True,
                        "text": f"Access denied. The user {user_id} does not have access to the {db_name} database. Please contact your administrator.",
                        "sql": sql,
                    }
                else:
                    raise
            cursor = conn.cursor()

            # Execute the query directly — Ranger enforces policies for this user
            cursor.execute(sql)

            # Fetch column names
            columns = [desc[0] for desc in cursor.description] if cursor.description else []

            # Fetch rows (with limit)
            rows = cursor.fetchmany(self._max_rows)
            total_rows = cursor.rowcount or len(rows)

            # Strip Hudi internal metadata columns (_hoodie_*)
            hoodie_idx = {i for i, c in enumerate(columns) if c.startswith("_hoodie_")}
            if hoodie_idx:
                columns = [c for i, c in enumerate(columns) if i not in hoodie_idx]
                rows = [tuple(v for i, v in enumerate(row) if i not in hoodie_idx) for row in rows]

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

            trace("starrocks_query_success", {
                "latency_ms": latency_ms,
                "rows": len(rows_list),
                "total_rows": total_rows,
            })
            event("starrocks.query", {
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

            # Ranger / StarRocks privilege denial — stop LLM retrying, show clean message
            if "5204" in error_text or "Access denied" in error_text or "privilege" in error_text.lower():
                # Extract schema name from SQL e.g. biometric_service.sr_biometric_currentmonth
                schema_match = re.search(r'\b(\w+)\.\w+', sql)
                db_name = schema_match.group(1) if schema_match else (settings.STARROCKS_DATABASE or "StarRocks")
                return {
                    "is_error": True,
                    "text": f"Access denied. The user {user_id} does not have access to the {db_name} database. Please contact your administrator.",
                    "sql": sql,
                    "latency_ms": latency_ms,
                }

            return {
                "is_error": True,
                "text": f"StarRocks query failed: {error_text}",
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

        lines: List[str] = []

        # Markdown table — all columns, UI handles horizontal scroll
        lines.append("| " + " | ".join(str(c) for c in columns) + " |")
        lines.append("| " + " | ".join("---" for _ in columns) + " |")

        display_rows = rows[:50]
        for row in display_rows:
            line = "| " + " | ".join(str(v) if v is not None else "NULL" for v in row) + " |"
            lines.append(line)

        if total_rows > len(display_rows):
            lines.append(f"\n*Showing {len(display_rows)} of {total_rows} rows*")

        return "\n".join(lines)

    # ------------------------------------------------------------------ #
    #  Cache helpers                                                       #
    # ------------------------------------------------------------------ #

    def _cache_key(self, sql: str, user_id: Optional[str] = None) -> str:
        import hashlib
        user_scope = user_id or settings.SINGLE_USER_ID
        base = f"{user_scope}:sr:{sql.strip()}"
        digest = hashlib.sha256(base.encode("utf-8")).hexdigest()
        return f"tg:sr:cache:{digest}"

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
            if len(data) < settings.STARROCKS_RESULT_CACHE_MAX_BYTES:
                self._redis.setex(key, self._result_cache_ttl, data)
        except Exception as e:
            logger.warning(f"Failed to cache StarRocks result: {e}")

    # ------------------------------------------------------------------ #
    #  Health check                                                        #
    # ------------------------------------------------------------------ #

    def is_healthy(self) -> bool:
        """Quick connectivity check to StarRocks via TCP port probe."""
        import socket
        try:
            with socket.create_connection((settings.STARROCKS_HOST, settings.STARROCKS_PORT), timeout=5):
                return True
        except Exception:
            return False
