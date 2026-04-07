# gateway_app/services/rate_limiter.py
"""Rate limiting service using Redis for distributed rate limiting."""
import time
from typing import Optional, Tuple
from redis import Redis
from fastapi import Request, Response, status
from fastapi.responses import JSONResponse

from ..config.settings import settings
from .log_context import get_context
from .audit import log_action
from .telemetry import event


class RateLimiter:
    """
    Distributed rate limiter using Redis.
    Implements sliding window rate limiting with per-user, per-conversation, and per-IP limits.
    """

    def __init__(self, redis_url: Optional[str] = None):
        """Initialize rate limiter with Redis connection."""
        self._redis_url = redis_url or settings.RATE_LIMIT_STORAGE_URI or settings.REDIS_URL
        self._redis: Optional[Redis] = None
        self._enabled = settings.RATE_LIMIT_ENABLED

    def _get_redis(self) -> Redis:
        """Get or create Redis connection."""
        if self._redis is None:
            self._redis = Redis.from_url(self._redis_url, decode_responses=True)
        return self._redis

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request."""
        # Only trust forwarded headers if request came from a trusted proxy
        client_host = request.client.host if request.client else None
        if client_host and client_host in settings.TRUSTED_PROXY_IPS:
            forwarded_for = request.headers.get("X-Forwarded-For")
            if forwarded_for:
                # Take the first IP in the chain
                return forwarded_for.split(",")[0].strip()

            real_ip = request.headers.get("X-Real-IP")
            if real_ip:
                return real_ip.strip()

        # Fallback to direct client IP
        if client_host:
            return client_host
        
        return "unknown"

    def _make_key(self, prefix: str, identifier: str) -> str:
        """Create Redis key for rate limiting."""
        return f"tg:ratelimit:{prefix}:{identifier}"

    def _check_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int = 60,
    ) -> Tuple[bool, int, int]:
        """
        Check if request is within rate limit using sliding window.
        
        Returns:
            (allowed, remaining, reset_after_seconds)
        """
        if not self._enabled or limit <= 0:
            return True, limit, window_seconds

        try:
            redis = self._get_redis()
            now = time.time()
            window_start = now - window_seconds

            # Use sorted set to track requests in the window
            # Score is timestamp, value is request ID (we use timestamp as value too)
            pipe = redis.pipeline()
            
            # Remove old entries outside the window
            pipe.zremrangebyscore(key, 0, window_start)
            
            # Count current requests in window
            pipe.zcard(key)
            
            # Add current request
            pipe.zadd(key, {str(now): now})
            
            # Set expiration to window size + 1 second
            pipe.expire(key, window_seconds + 1)
            
            results = pipe.execute()
            current_count = results[1] + 1  # +1 for the request we just added
            
            allowed = current_count <= limit
            remaining = max(0, limit - current_count)
            reset_after = int(window_seconds - (now - window_start)) if not allowed else 0
            
            return allowed, remaining, reset_after
        except Exception as e:
            # If Redis is unavailable, log the error but allow the request (fail open)
            # This prevents Redis outages from blocking all traffic
            from .telemetry import exception
            exception(e, {"rate_limit_key": key, "error": "Redis connection failed"})
            # Fail open: allow request if Redis is down
            return True, limit, 0

    async def check_rate_limit(self, request: Request) -> Optional[Response]:
        """
        Check rate limits for the request.
        
        Returns:
            None if request is allowed, Response with 429 if rate limited
        """
        if not self._enabled:
            return None

        context = get_context()
        user_id = context.get("user_id")
        conversation_id = context.get("conversation_id")
        client_ip = self._get_client_ip(request)

        violations = []
        retry_after = 0

        # Check per-user limit
        if user_id:
            user_key = self._make_key("user", user_id)
            allowed, remaining, reset_after = self._check_limit(
                user_key,
                settings.RATE_LIMIT_PER_USER_PER_MINUTE,
            )
            if not allowed:
                violations.append(f"user limit ({settings.RATE_LIMIT_PER_USER_PER_MINUTE}/min)")
                retry_after = max(retry_after, reset_after)

        # Check per-conversation limit
        if conversation_id:
            conv_key = self._make_key("conversation", conversation_id)
            allowed, remaining, reset_after = self._check_limit(
                conv_key,
                settings.RATE_LIMIT_PER_CONVERSATION_PER_MINUTE,
            )
            if not allowed:
                violations.append(f"conversation limit ({settings.RATE_LIMIT_PER_CONVERSATION_PER_MINUTE}/min)")
                retry_after = max(retry_after, reset_after)

        # Check per-IP limit
        if client_ip and client_ip != "unknown":
            ip_key = self._make_key("ip", client_ip)
            allowed, remaining, reset_after = self._check_limit(
                ip_key,
                settings.RATE_LIMIT_PER_IP_PER_MINUTE,
            )
            if not allowed:
                violations.append(f"IP limit ({settings.RATE_LIMIT_PER_IP_PER_MINUTE}/min)")
                retry_after = max(retry_after, reset_after)

        # If any limit is exceeded, return 429
        if violations:
            # Log rate limit violation
            log_action(
                "rate_limit_violation",
                user_id=user_id,
                conversation_id=conversation_id,
                details={
                    "violations": violations,
                    "client_ip": client_ip,
                    "path": str(request.url.path),
                },
            )
            
            # Emit telemetry event
            event(
                "rate_limit.violation",
                {
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "client_ip": client_ip,
                    "violations": violations,
                },
            )

            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Rate limit exceeded",
                    "details": f"Request rate limit exceeded: {', '.join(violations)}. Please try again later.",
                    "retry_after": retry_after,
                },
                headers={
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(settings.RATE_LIMIT_PER_USER_PER_MINUTE),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(time.time()) + retry_after),
                },
            )

        return None

    def get_rate_limit_headers(self, request: Request) -> dict:
        """
        Get rate limit headers for successful requests.
        Returns headers with current rate limit status.
        """
        if not self._enabled:
            return {}

        context = get_context()
        user_id = context.get("user_id")
        if not user_id:
            return {}

        try:
            user_key = self._make_key("user", user_id)
            redis = self._get_redis()
            
            # Get current count
            now = time.time()
            window_start = now - 60
            redis.zremrangebyscore(user_key, 0, window_start)
            current_count = redis.zcard(user_key)
            
            limit = settings.RATE_LIMIT_PER_USER_PER_MINUTE
            remaining = max(0, limit - current_count)
            reset_time = int(now + 60)

            return {
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": str(remaining),
                "X-RateLimit-Reset": str(reset_time),
            }
        except Exception:
            # If Redis is unavailable, return empty headers (fail gracefully)
            return {}


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """Get the global rate limiter instance."""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = RateLimiter()
    return _rate_limiter

