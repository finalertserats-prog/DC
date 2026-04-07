# gateway_app/services/error_aggregator.py
"""Error aggregation and rate tracking for alerting."""
import time
import logging
from typing import Dict, List, Optional
from collections import deque, defaultdict
from threading import Lock

from .telemetry import event

logger = logging.getLogger(__name__)


class ErrorAggregator:
    """Tracks error rates and patterns for alerting."""
    
    def __init__(self, window_seconds: float = 300.0, max_entries: int = 1000):
        self.window_seconds = window_seconds
        self.max_entries = max_entries
        self._lock = Lock()
        
        # Error entries: (timestamp, error_type, error_code, details)
        self._errors: deque = deque(maxlen=max_entries)
        
        # Error counts by type
        self._error_counts: Dict[str, int] = defaultdict(int)
        
        # Error counts by code
        self._error_code_counts: Dict[str, int] = defaultdict(int)
        
        # Last alert time per error type (to prevent alert spam)
        self._last_alert_time: Dict[str, float] = {}
        self._alert_cooldown = 60.0  # 1 minute cooldown between alerts
    
    def record_error(
        self,
        error_type: str,
        error_code: Optional[str] = None,
        details: Optional[Dict] = None,
    ) -> None:
        """Record an error occurrence."""
        timestamp = time.time()
        
        with self._lock:
            self._errors.append((timestamp, error_type, error_code or "unknown", details or {}))
            self._error_counts[error_type] += 1
            if error_code:
                self._error_code_counts[error_code] += 1
            
            # Check if we should alert
            self._check_and_alert(error_type, error_code)
    
    def _get_error_rate_unlocked(self, error_type: Optional[str] = None) -> float:
        """Get error rate without acquiring lock (must be called with lock held)."""
        now = time.time()
        cutoff = now - self.window_seconds
        
        recent_errors = [
            (ts, et, code, details)
            for ts, et, code, details in self._errors
            if ts >= cutoff
        ]
        
        if error_type:
            recent_errors = [e for e in recent_errors if e[1] == error_type]
        
        count = len(recent_errors)
        return count / self.window_seconds if self.window_seconds > 0 else 0.0
    
    def get_error_rate(self, error_type: Optional[str] = None) -> float:
        """Get error rate (errors per second) for a specific error type or all errors."""
        with self._lock:
            return self._get_error_rate_unlocked(error_type)
    
    def get_error_count(self, error_type: Optional[str] = None) -> int:
        """Get total error count for a specific error type or all errors."""
        with self._lock:
            if error_type:
                return self._error_counts.get(error_type, 0)
            return sum(self._error_counts.values())
    
    def get_error_summary(self) -> Dict:
        """Get summary of recent errors."""
        now = time.time()
        cutoff = now - self.window_seconds
        
        with self._lock:
            recent_errors = [
                (ts, et, code, details)
                for ts, et, code, details in self._errors
                if ts >= cutoff
            ]
            
            # Group by error type
            by_type: Dict[str, int] = defaultdict(int)
            by_code: Dict[str, int] = defaultdict(int)
            
            for _, et, code, _ in recent_errors:
                by_type[et] += 1
                by_code[code] += 1
            
            return {
                "window_seconds": self.window_seconds,
                "total_errors": len(recent_errors),
                "error_rate_per_second": len(recent_errors) / self.window_seconds if self.window_seconds > 0 else 0.0,
                "by_type": dict(by_type),
                "by_code": dict(by_code),
                "total_count_by_type": dict(self._error_counts),
                "total_count_by_code": dict(self._error_code_counts),
            }
    
    def _check_and_alert(self, error_type: str, error_code: Optional[str]) -> None:
        """Check error rate and emit alert if threshold exceeded.
        
        Must be called with lock already held.
        """
        error_rate = self._get_error_rate_unlocked(error_type)
        
        # Alert thresholds (configurable)
        threshold = 1.0  # 1 error per second
        if error_rate > threshold:
            # Check cooldown
            last_alert = self._last_alert_time.get(error_type, 0)
            if time.time() - last_alert < self._alert_cooldown:
                return
            
            self._last_alert_time[error_type] = time.time()
            
            # Emit alert event
            event(
                "error_rate_alert",
                {
                    "error_type": error_type,
                    "error_code": error_code,
                    "error_rate": error_rate,
                    "threshold": threshold,
                    "window_seconds": self.window_seconds,
                },
            )
            
            logger.warning(
                f"High error rate detected for {error_type}: {error_rate:.2f} errors/second "
                f"(threshold: {threshold})"
            )
    
    def reset(self) -> None:
        """Reset error tracking (for testing)."""
        with self._lock:
            self._errors.clear()
            self._error_counts.clear()
            self._error_code_counts.clear()
            self._last_alert_time.clear()


# Global error aggregator instance
_error_aggregator: Optional[ErrorAggregator] = None


def get_error_aggregator() -> ErrorAggregator:
    """Get or create the global error aggregator."""
    global _error_aggregator
    if _error_aggregator is None:
        _error_aggregator = ErrorAggregator()
    return _error_aggregator

