# gateway_app/services/audit.py
"""Comprehensive audit logging service for security and compliance."""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Optional
from datetime import datetime, timezone

from redis import Redis
from ..config.settings import settings
from .log_context import get_context

_audit_logger = logging.getLogger("audit")

# Audit log storage configuration
AUDIT_LOG_PREFIX = "tg:audit:"
AUDIT_LOG_RETENTION_DAYS = 90  # Default retention: 90 days
AUDIT_LOG_MAX_ENTRIES_PER_USER = 10000  # Max entries per user to prevent unbounded growth


class AuditLogger:
    """
    Comprehensive audit logging service.
    Stores audit logs in Redis with retention policies and provides structured logging.
    """

    def __init__(self, redis_url: Optional[str] = None):
        """Initialize audit logger with Redis connection."""
        self._redis_url = redis_url or settings.REDIS_URL
        self._redis: Optional[Redis] = None
        self._retention_days = int(
            getattr(settings, "AUDIT_LOG_RETENTION_DAYS", AUDIT_LOG_RETENTION_DAYS)
        )

    def _get_redis(self) -> Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            self._redis = Redis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    def _make_key(self, user_id: Optional[str], action: str, timestamp: float) -> str:
        """Create Redis key for audit log entry."""
        user_part = user_id or "anonymous"
        # Use timestamp for ordering and uniqueness
        ts_str = f"{timestamp:.6f}"
        return f"{AUDIT_LOG_PREFIX}{user_part}:{action}:{ts_str}"

    def _make_index_key(self, user_id: Optional[str]) -> str:
        """Create index key for user's audit logs."""
        user_part = user_id or "anonymous"
        return f"{AUDIT_LOG_PREFIX}index:{user_part}"

    def log_action(
        self,
        action: str,
        *,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        severity: str = "info",
    ) -> None:
        """
        Log an audit event.
        
        Args:
            action: Action identifier (e.g., "tool.call", "command.execute", "rate_limit.violation")
            user_id: User ID (optional, will use context if not provided)
            conversation_id: Conversation ID (optional, will use context if not provided)
            details: Additional details about the action
            severity: Severity level ("info", "warning", "error", "critical")
        """
        context = get_context()
        user_id = user_id or context.get("user_id")
        conversation_id = conversation_id or context.get("conversation_id")
        correlation_id = context.get("correlation_id")

        timestamp = time.time()
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)

        payload: Dict[str, Any] = {
            "action": action,
            "timestamp": dt.isoformat(),
            "timestamp_unix": timestamp,
            "severity": severity,
            "context": {
                "user_id": user_id,
                "conversation_id": conversation_id,
                "correlation_id": correlation_id,
            },
        }
        if details:
            payload["details"] = details

        # Log to standard logger (structured JSON)
        _audit_logger.info("audit", extra={"audit": payload})

        # Store in Redis for querying and retention
        try:
            redis = self._get_redis()
            key = self._make_key(user_id, action, timestamp)
            
            # Store audit entry
            redis.setex(
                key,
                self._retention_days * 24 * 60 * 60,  # TTL in seconds
                json.dumps(payload, default=str),
            )

            # Maintain index for user's audit logs (sorted set by timestamp)
            if user_id:
                index_key = self._make_index_key(user_id)
                redis.zadd(index_key, {key: timestamp})
                redis.expire(index_key, self._retention_days * 24 * 60 * 60)
                
                # Trim index if it exceeds max entries
                count = redis.zcard(index_key)
                if count > AUDIT_LOG_MAX_ENTRIES_PER_USER:
                    # Remove oldest entries
                    redis.zremrangebyrank(index_key, 0, count - AUDIT_LOG_MAX_ENTRIES_PER_USER)

        except Exception as e:
            # If Redis fails, still log to standard logger
            _audit_logger.error(f"Failed to store audit log in Redis: {e}", exc_info=True)

    def query_audit_logs(
        self,
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        limit: int = 100,
    ) -> list[Dict[str, Any]]:
        """
        Query audit logs.
        
        Args:
            user_id: Filter by user ID
            action: Filter by action type
            start_time: Start timestamp (Unix)
            end_time: End timestamp (Unix)
            limit: Maximum number of results
            
        Returns:
            List of audit log entries
        """
        try:
            redis = self._get_redis()
            results = []

            if user_id:
                # Query from user index
                index_key = self._make_index_key(user_id)
                start_score = start_time or 0
                end_score = end_time or time.time()
                
                keys = redis.zrangebyscore(
                    index_key,
                    start_score,
                    end_score,
                    start=0,
                    num=limit,
                    withscores=False,
                )
                
                for key in keys:
                    raw = redis.get(key)
                    if raw:
                        try:
                            entry = json.loads(raw)
                            if not action or entry.get("action") == action:
                                results.append(entry)
                        except json.JSONDecodeError:
                            continue
            else:
                # Scan all audit keys (less efficient, use sparingly)
                pattern = f"{AUDIT_LOG_PREFIX}*"
                for key in redis.scan_iter(match=pattern, count=1000):
                    if ":index:" in key:
                        continue
                    raw = redis.get(key)
                    if raw:
                        try:
                            entry = json.loads(raw)
                            if action and entry.get("action") != action:
                                continue
                            entry_time = entry.get("timestamp_unix", 0)
                            if start_time and entry_time < start_time:
                                continue
                            if end_time and entry_time > end_time:
                                continue
                            results.append(entry)
                            if len(results) >= limit:
                                break
                        except (json.JSONDecodeError, KeyError):
                            continue

            # Sort by timestamp (newest first)
            results.sort(key=lambda x: x.get("timestamp_unix", 0), reverse=True)
            return results[:limit]

        except Exception as e:
            _audit_logger.error(f"Failed to query audit logs: {e}", exc_info=True)
            return []


# Global audit logger instance
_audit_logger_instance: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    """Get the global audit logger instance."""
    global _audit_logger_instance
    if _audit_logger_instance is None:
        _audit_logger_instance = AuditLogger()
    return _audit_logger_instance


# Convenience functions for backward compatibility and ease of use
def log_action(
    action: str,
    *,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    severity: str = "info",
) -> None:
    """Log an audit action (convenience function)."""
    logger = get_audit_logger()
    logger.log_action(
        action=action,
        user_id=user_id,
        conversation_id=conversation_id,
        details=details,
        severity=severity,
    )


def log_tool_call(
    tool_name: str,
    server: Optional[str] = None,
    arguments: Optional[Dict[str, Any]] = None,
    success: bool = True,
    error: Optional[str] = None,
    *,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
) -> None:
    """Log a tool call event."""
    details = {
        "tool_name": tool_name,
        "server": server,
        "success": success,
    }
    if arguments:
        # Sanitize arguments (don't log sensitive data)
        sanitized_args = {}
        for k, v in arguments.items():
            if isinstance(v, (str, int, float, bool, type(None))):
                sanitized_args[k] = v
            elif isinstance(v, (list, dict)):
                # Limit size of complex structures
                arg_str = json.dumps(v, default=str)
                if len(arg_str) > 500:
                    sanitized_args[k] = f"{arg_str[:500]}... (truncated)"
                else:
                    sanitized_args[k] = v
            else:
                sanitized_args[k] = str(v)[:100]  # Truncate long values
        details["arguments"] = sanitized_args
    
    if error:
        details["error"] = error

    severity = "error" if not success else "info"
    log_action(
        "tool.call",
        user_id=user_id,
        conversation_id=conversation_id,
        details=details,
        severity=severity,
    )


def log_command(
    command: str,
    arguments: Optional[Dict[str, Any]] = None,
    success: bool = True,
    *,
    user_id: Optional[str] = None,
    conversation_id: Optional[str] = None,
) -> None:
    """Log a command execution."""
    details = {"command": command, "success": success}
    if arguments:
        details["arguments"] = arguments

    severity = "error" if not success else "info"
    log_action(
        "command.execute",
        user_id=user_id,
        conversation_id=conversation_id,
        details=details,
        severity=severity,
    )


def log_config_change(
    change_type: str,
    resource: str,
    old_value: Optional[Any] = None,
    new_value: Optional[Any] = None,
    *,
    user_id: Optional[str] = None,
) -> None:
    """Log a configuration change."""
    details = {
        "change_type": change_type,
        "resource": resource,
    }
    if old_value is not None:
        details["old_value"] = str(old_value)[:500]  # Truncate long values
    if new_value is not None:
        details["new_value"] = str(new_value)[:500]

    log_action(
        "config.change",
        user_id=user_id,
        details=details,
        severity="warning",  # Config changes are important
    )


def log_authentication(
    event_type: str,
    user_id: Optional[str] = None,
    success: bool = True,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Log authentication/authorization events."""
    audit_details = {"event_type": event_type, "success": success}
    if details:
        audit_details.update(details)

    severity = "critical" if not success else "info"
    log_action(
        "auth.event",
        user_id=user_id,
        details=audit_details,
        severity=severity,
    )
