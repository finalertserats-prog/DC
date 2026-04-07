# gateway_app/services/circuit_breaker.py
"""Full circuit breaker implementation for resilience with metrics and monitoring."""
import asyncio
import time
import logging
from enum import Enum
from typing import Callable, Any, Optional, Dict, List
from threading import Lock
from collections import deque

from .telemetry import event, trace
from .exceptions import GatewayException
from ..config.settings import settings

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


class CircuitBreakerError(GatewayException):
    """Raised when circuit breaker is open."""
    def __init__(self, name: str):
        super().__init__(
            f"Circuit breaker '{name}' is open.",
            user_message="The service is temporarily unavailable. Please try again later.",
        )
        self.circuit_name = name


class CircuitBreaker:
    """
    Full circuit breaker implementation with metrics and monitoring.
    
    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Too many failures, reject requests immediately
    - HALF_OPEN: Testing recovery, allow limited requests
    
    Transitions:
    - CLOSED -> OPEN: After failure_threshold failures
    - OPEN -> HALF_OPEN: After timeout_seconds
    - HALF_OPEN -> CLOSED: After success_threshold successes
    - HALF_OPEN -> OPEN: After any failure
    
    Features:
    - Metrics tracking (success/failure rates, latency)
    - Configurable thresholds
    - State monitoring
    - Fallback response support
    """

    def __init__(
        self,
        name: str,
        failure_threshold: Optional[int] = None,
        timeout_seconds: Optional[float] = None,
        success_threshold: Optional[int] = None,
        expected_exception: type = Exception,
        fallback_func: Optional[Callable] = None,
    ):
        self.name = name
        
        # Use configurable thresholds with defaults
        self.failure_threshold = failure_threshold or int(
            getattr(settings, "CIRCUIT_BREAKER_FAILURE_THRESHOLD", 5)
        )
        self.timeout_seconds = timeout_seconds or float(
            getattr(settings, "CIRCUIT_BREAKER_TIMEOUT_SECONDS", 60.0)
        )
        self.success_threshold = success_threshold or int(
            getattr(settings, "CIRCUIT_BREAKER_SUCCESS_THRESHOLD", 1)
        )
        self.expected_exception = expected_exception
        self.fallback_func = fallback_func

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time: Optional[float] = None
        self._lock = Lock()
        
        # Metrics tracking
        self._total_calls = 0
        self._total_successes = 0
        self._total_failures = 0
        self._total_rejected = 0  # Rejected due to OPEN state
        self._latency_history: deque = deque(maxlen=100)  # Track last 100 call latencies
        self._state_history: List[Dict[str, Any]] = []  # Track state transitions

    @property
    def state(self) -> CircuitState:
        """Get current circuit breaker state."""
        with self._lock:
            return self._state

    def _transition_to(self, new_state: CircuitState, reason: str) -> None:
        """Transition to a new state and log the change."""
        old_state = self._state
        if old_state != new_state:
            self._state = new_state
            transition_record = {
                "timestamp": time.time(),
                "old_state": old_state.value,
                "new_state": new_state.value,
                "reason": reason,
            }
            self._state_history.append(transition_record)
            # Keep only last 50 transitions
            if len(self._state_history) > 50:
                self._state_history = self._state_history[-50:]
            
            event(
                "circuit_breaker.state_change",
                {
                    "circuit": self.name,
                    "old_state": old_state.value,
                    "new_state": new_state.value,
                    "reason": reason,
                },
            )
            logger.info(
                f"Circuit breaker '{self.name}' transitioned from {old_state.value} to {new_state.value}: {reason}"
            )

    def _check_timeout(self) -> None:
        """Check if timeout has elapsed and transition to HALF_OPEN if needed."""
        if self._state == CircuitState.OPEN and self._last_failure_time:
            elapsed = time.time() - self._last_failure_time
            if elapsed >= self.timeout_seconds:
                self._transition_to(CircuitState.HALF_OPEN, f"Timeout elapsed ({elapsed:.1f}s)")
                self._success_count = 0

    def _record_success(self) -> None:
        """Record a successful call."""
        with self._lock:
            self._check_timeout()

            self._total_successes += 1

            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.success_threshold:
                    self._transition_to(CircuitState.CLOSED, f"{self._success_count} successful calls")
                    self._failure_count = 0
                    self._success_count = 0
            elif self._state == CircuitState.CLOSED:
                # Reset failure count on success in CLOSED state
                self._failure_count = 0

    def _record_failure(self) -> None:
        """Record a failed call."""
        with self._lock:
            self._check_timeout()

            self._failure_count += 1
            self._total_failures += 1
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                # Any failure in HALF_OPEN immediately opens the circuit
                self._transition_to(CircuitState.OPEN, "Failure during recovery test")
                self._success_count = 0
            elif self._state == CircuitState.CLOSED:
                if self._failure_count >= self.failure_threshold:
                    self._transition_to(
                        CircuitState.OPEN,
                        f"{self._failure_count} consecutive failures",
                    )

    def call(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        """
        Call a function through the circuit breaker (synchronous).
        
        Raises CircuitBreakerError if circuit is open.
        Returns fallback_func() result if circuit is open and fallback is configured.
        """
        start_time = time.time()
        self._total_calls += 1
        
        with self._lock:
            self._check_timeout()

            if self._state == CircuitState.OPEN:
                self._total_rejected += 1
                if self.fallback_func:
                    try:
                        return self.fallback_func(*args, **kwargs)
                    except Exception:
                        pass
                raise CircuitBreakerError(self.name)

        try:
            result = func(*args, **kwargs)
            latency = time.time() - start_time
            self._latency_history.append(latency)
            self._record_success()
            return result
        except self.expected_exception as e:
            latency = time.time() - start_time
            self._latency_history.append(latency)
            self._record_failure()
            raise
        except Exception as e:
            latency = time.time() - start_time
            self._latency_history.append(latency)
            self._record_failure()
            raise

    async def call_async(self, func: Callable, *args: Any, **kwargs: Any) -> Any:
        """
        Call an async function through the circuit breaker.
        
        Raises CircuitBreakerError if circuit is open.
        Returns fallback_func() result if circuit is open and fallback is configured.
        """
        start_time = time.time()
        self._total_calls += 1
        
        with self._lock:
            self._check_timeout()

            if self._state == CircuitState.OPEN:
                self._total_rejected += 1
                if self.fallback_func:
                    try:
                        if asyncio.iscoroutinefunction(self.fallback_func):
                            return await self.fallback_func(*args, **kwargs)
                        else:
                            return self.fallback_func(*args, **kwargs)
                    except Exception:
                        pass
                raise CircuitBreakerError(self.name)

        try:
            result = await func(*args, **kwargs)
            latency = time.time() - start_time
            self._latency_history.append(latency)
            self._record_success()
            return result
        except self.expected_exception as e:
            latency = time.time() - start_time
            self._latency_history.append(latency)
            self._record_failure()
            raise
        except Exception as e:
            latency = time.time() - start_time
            self._latency_history.append(latency)
            self._record_failure()
            raise

    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive circuit breaker statistics."""
        with self._lock:
            # Calculate metrics
            success_rate = (
                (self._total_successes / self._total_calls * 100)
                if self._total_calls > 0
                else 0.0
            )
            failure_rate = (
                (self._total_failures / self._total_calls * 100)
                if self._total_calls > 0
                else 0.0
            )
            rejection_rate = (
                (self._total_rejected / self._total_calls * 100)
                if self._total_calls > 0
                else 0.0
            )
            
            avg_latency = (
                sum(self._latency_history) / len(self._latency_history)
                if self._latency_history
                else 0.0
            )
            min_latency = min(self._latency_history) if self._latency_history else 0.0
            max_latency = max(self._latency_history) if self._latency_history else 0.0
            
            time_in_state = (
                time.time() - self._state_history[-1]["timestamp"]
                if self._state_history
                else 0.0
            )
            
            return {
                "name": self.name,
                "state": self._state.value,
                "failure_count": self._failure_count,
                "success_count": self._success_count,
                "last_failure_time": self._last_failure_time,
                "time_in_state_seconds": time_in_state,
                "metrics": {
                    "total_calls": self._total_calls,
                    "total_successes": self._total_successes,
                    "total_failures": self._total_failures,
                    "total_rejected": self._total_rejected,
                    "success_rate_percent": round(success_rate, 2),
                    "failure_rate_percent": round(failure_rate, 2),
                    "rejection_rate_percent": round(rejection_rate, 2),
                    "avg_latency_seconds": round(avg_latency, 4),
                    "min_latency_seconds": round(min_latency, 4),
                    "max_latency_seconds": round(max_latency, 4),
                    "sample_size": len(self._latency_history),
                },
                "configuration": {
                    "failure_threshold": self.failure_threshold,
                    "timeout_seconds": self.timeout_seconds,
                    "success_threshold": self.success_threshold,
                },
                "recent_transitions": self._state_history[-10:],  # Last 10 transitions
            }
    
    def reset(self) -> None:
        """Reset circuit breaker to CLOSED state (for testing/recovery)."""
        with self._lock:
            self._state = CircuitState.CLOSED
            self._failure_count = 0
            self._success_count = 0
            self._last_failure_time = None
            logger.info(f"Circuit breaker '{self.name}' manually reset to CLOSED state")


# Global circuit breakers
_llm_circuit_breaker: Optional[CircuitBreaker] = None


def get_all_circuit_breakers() -> Dict[str, CircuitBreaker]:
    """Get all circuit breakers (for monitoring)."""
    breakers = {}
    if _llm_circuit_breaker:
        breakers["llm"] = _llm_circuit_breaker
    return breakers


def get_llm_circuit_breaker() -> CircuitBreaker:
    """Get or create the LLM circuit breaker."""
    global _llm_circuit_breaker
    if _llm_circuit_breaker is None:
        # LLM-specific fallback
        def llm_fallback(*args: Any, **kwargs: Any) -> Dict[str, Any]:
            return {
                "error": "LLM service unavailable",
                "message": "The language model service is temporarily unavailable. Please try again later.",
            }
        
        _llm_circuit_breaker = CircuitBreaker(
            name="llm",
            failure_threshold=None,  # Use defaults from settings
            timeout_seconds=None,
            success_threshold=None,
            fallback_func=llm_fallback,
        )
    return _llm_circuit_breaker




