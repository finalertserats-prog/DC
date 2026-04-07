# gateway_app/services/retry.py
"""Retry strategies with exponential backoff and jitter."""
import asyncio
import random
import time
import logging
from typing import Callable, TypeVar, Optional, List, Dict, Any
from functools import wraps

from .exceptions import GatewayException
from .telemetry import event, exception

logger = logging.getLogger(__name__)

T = TypeVar("T")


class RetryableError(GatewayException):
    """Base class for errors that can be retried."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        retry_after: Optional[float] = None,
    ):
        super().__init__(message, user_message=user_message, cause=cause)
        self.retry_after = retry_after


class RetryExhaustedError(GatewayException):
    """Raised when all retry attempts are exhausted."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        attempts: int = 0,
        total_duration: float = 0.0,
    ):
        super().__init__(message, user_message=user_message, cause=cause)
        self.attempts = attempts
        self.total_duration = total_duration


class RetryPolicy:
    """Configuration for retry behavior."""
    
    def __init__(
        self,
        max_attempts: int = 3,
        initial_delay: float = 0.5,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
        jitter_range: float = 0.1,
        retryable_exceptions: tuple = (Exception,),
        non_retryable_exceptions: tuple = (),
    ):
        self.max_attempts = max_attempts
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
        self.jitter_range = jitter_range
        self.retryable_exceptions = retryable_exceptions
        self.non_retryable_exceptions = non_retryable_exceptions

    def should_retry(self, attempt: int, exc: Exception) -> bool:
        """Determine if an exception should be retried."""
        if attempt >= self.max_attempts:
            return False
        
        # Check if exception is explicitly non-retryable
        if isinstance(exc, self.non_retryable_exceptions):
            return False
        
        # Check if exception is retryable
        if isinstance(exc, self.retryable_exceptions):
            return True
        
        # Check if exception is a GatewayException with retry_after
        if isinstance(exc, RetryableError) and exc.retry_after is not None:
            return True
        
        # Default: don't retry
        return False

    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for a retry attempt with exponential backoff and jitter."""
        # Exponential backoff: delay = initial_delay * (base ^ attempt)
        delay = self.initial_delay * (self.exponential_base ** attempt)
        
        # Cap at max_delay
        delay = min(delay, self.max_delay)
        
        # Add jitter if enabled
        if self.jitter:
            jitter_amount = delay * self.jitter_range
            delay += random.uniform(-jitter_amount, jitter_amount)
            delay = max(0.0, delay)  # Ensure non-negative
        
        return delay


def retry_with_backoff(
    func: Optional[Callable] = None,
    *,
    policy: Optional[RetryPolicy] = None,
    operation_name: Optional[str] = None,
) -> Callable:
    """
    Decorator for retrying async functions with exponential backoff.
    
    Usage:
        @retry_with_backoff(policy=RetryPolicy(max_attempts=3))
        async def my_function():
            ...
    """
    if policy is None:
        policy = RetryPolicy()
    
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            op_name = operation_name or f.__name__
            last_exception: Optional[Exception] = None
            start_time = time.time()
            
            for attempt in range(1, policy.max_attempts + 1):
                try:
                    result = await f(*args, **kwargs)
                    
                    # Log success after retry
                    if attempt > 1:
                        event(
                            "retry.success",
                            {
                                "operation": op_name,
                                "attempt": attempt,
                                "total_attempts": attempt,
                                "duration_seconds": time.time() - start_time,
                            },
                        )
                    
                    return result
                    
                except Exception as e:
                    last_exception = e
                    
                    # If this is the last attempt, don't retry - raise RetryExhaustedError
                    if attempt >= policy.max_attempts:
                        break
                    
                    # Check if we should retry
                    if not policy.should_retry(attempt, e):
                        # Log non-retryable error
                        exception(
                            e,
                            {
                                "operation": op_name,
                                "attempt": attempt,
                                "retryable": False,
                            },
                        )
                        raise
                    
                    # Log retry attempt
                    event(
                        "retry.attempt",
                        {
                            "operation": op_name,
                            "attempt": attempt,
                            "max_attempts": policy.max_attempts,
                            "error": str(e),
                            "error_type": type(e).__name__,
                        },
                    )
                    
                    # Sleep before next attempt
                    delay = policy.calculate_delay(attempt - 1)  # attempt is 1-indexed
                    await asyncio.sleep(delay)
            
            # All retries exhausted
            total_duration = time.time() - start_time
            retry_exhausted = RetryExhaustedError(
                f"Operation '{op_name}' failed after {policy.max_attempts} attempts.",
                user_message="The operation failed after multiple retry attempts. Please try again later.",
                cause=last_exception,
                attempts=policy.max_attempts,
                total_duration=total_duration,
            )
            
            event(
                "retry.exhausted",
                {
                    "operation": op_name,
                    "attempts": policy.max_attempts,
                    "total_duration_seconds": total_duration,
                    "final_error": str(last_exception) if last_exception else None,
                },
            )
            
            raise retry_exhausted from last_exception
        
        return wrapper
    
    if func is None:
        return decorator
    else:
        return decorator(func)


def retry_sync_with_backoff(
    func: Optional[Callable] = None,
    *,
    policy: Optional[RetryPolicy] = None,
    operation_name: Optional[str] = None,
) -> Callable:
    """
    Decorator for retrying synchronous functions with exponential backoff.
    
    Usage:
        @retry_sync_with_backoff(policy=RetryPolicy(max_attempts=3))
        def my_function():
            ...
    """
    if policy is None:
        policy = RetryPolicy()
    
    def decorator(f: Callable) -> Callable:
        @wraps(f)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            op_name = operation_name or f.__name__
            last_exception: Optional[Exception] = None
            start_time = time.time()
            
            for attempt in range(1, policy.max_attempts + 1):
                try:
                    result = f(*args, **kwargs)
                    
                    # Log success after retry
                    if attempt > 1:
                        event(
                            "retry.success",
                            {
                                "operation": op_name,
                                "attempt": attempt,
                                "total_attempts": attempt,
                                "duration_seconds": time.time() - start_time,
                            },
                        )
                    
                    return result
                    
                except Exception as e:
                    last_exception = e
                    
                    # If this is the last attempt, don't retry - raise RetryExhaustedError
                    if attempt >= policy.max_attempts:
                        break
                    
                    # Check if we should retry
                    if not policy.should_retry(attempt, e):
                        # Log non-retryable error
                        exception(
                            e,
                            {
                                "operation": op_name,
                                "attempt": attempt,
                                "retryable": False,
                            },
                        )
                        raise
                    
                    # Log retry attempt
                    event(
                        "retry.attempt",
                        {
                            "operation": op_name,
                            "attempt": attempt,
                            "max_attempts": policy.max_attempts,
                            "error": str(e),
                            "error_type": type(e).__name__,
                        },
                    )
                    
                    # Sleep before next attempt
                    delay = policy.calculate_delay(attempt - 1)  # attempt is 1-indexed
                    time.sleep(delay)
            
            # All retries exhausted
            total_duration = time.time() - start_time
            retry_exhausted = RetryExhaustedError(
                f"Operation '{op_name}' failed after {policy.max_attempts} attempts.",
                user_message="The operation failed after multiple retry attempts. Please try again later.",
                cause=last_exception,
                attempts=policy.max_attempts,
                total_duration=total_duration,
            )
            
            event(
                "retry.exhausted",
                {
                    "operation": op_name,
                    "attempts": policy.max_attempts,
                    "total_duration_seconds": total_duration,
                    "final_error": str(last_exception) if last_exception else None,
                },
            )
            
            raise retry_exhausted from last_exception
        
        return wrapper
    
    if func is None:
        return decorator
    else:
        return decorator(func)


# Predefined retry policies
LLM_RETRY_POLICY = RetryPolicy(
    max_attempts=3,
    initial_delay=1.0,
    max_delay=30.0,
    exponential_base=2.0,
    jitter=True,
    retryable_exceptions=(RetryableError,),
    non_retryable_exceptions=(),
)

REDIS_RETRY_POLICY = RetryPolicy(
    max_attempts=2,
    initial_delay=0.1,
    max_delay=1.0,
    exponential_base=2.0,
    jitter=True,
    retryable_exceptions=(ConnectionError, TimeoutError),
    non_retryable_exceptions=(),
)

