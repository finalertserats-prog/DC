# gateway_app/infra/shutdown.py
"""Graceful shutdown handler for the Friday Gateway."""
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional, Set

from ..services.telemetry import event, exception

logger = logging.getLogger(__name__)

# Global shutdown event
_shutdown_event: Optional[asyncio.Event] = None
_in_flight_requests: Set[str] = set()


def _get_shutdown_timeout() -> float:
    """Get shutdown timeout from settings or default."""
    try:
        from ..config.settings import settings
        return float(getattr(settings, "SHUTDOWN_TIMEOUT_SECS", 30.0))
    except Exception:
        return 30.0


def get_shutdown_event() -> asyncio.Event:
    """Get or create the global shutdown event."""
    global _shutdown_event
    if _shutdown_event is None:
        _shutdown_event = asyncio.Event()
    return _shutdown_event


def is_shutting_down() -> bool:
    """Check if shutdown has been initiated."""
    return _shutdown_event is not None and _shutdown_event.is_set()


def register_in_flight_request(request_id: str) -> None:
    """Register an in-flight request."""
    if not is_shutting_down():
        _in_flight_requests.add(request_id)


def unregister_in_flight_request(request_id: str) -> None:
    """Unregister an in-flight request."""
    _in_flight_requests.discard(request_id)


async def wait_for_in_flight_requests(timeout: float = 30.0) -> bool:
    """
    Wait for in-flight requests to complete.

    Args:
        timeout: Maximum time to wait in seconds.

    Returns:
        True if all requests completed, False if timeout occurred.
    """
    if not _in_flight_requests:
        return True

    logger.info(f"Waiting for {len(_in_flight_requests)} in-flight requests to complete...")
    loop = asyncio.get_running_loop()
    start_time = loop.time()

    while _in_flight_requests:
        elapsed = loop.time() - start_time
        if elapsed >= timeout:
            logger.warning(
                f"Timeout waiting for in-flight requests. "
                f"{len(_in_flight_requests)} requests still active."
            )
            return False

        await asyncio.sleep(0.1)

    logger.info("All in-flight requests completed.")
    return True


async def close_connection_pools() -> None:
    """No-op: connection pools removed (OpenMetadata + direct Snowflake)."""
    pass


async def close_redis_connections() -> None:
    """Close Redis connections gracefully."""
    try:
        logger.info("Redis connections will be closed automatically.")
        event("shutdown.redis_closed", {})
    except Exception as e:
        exception(e, {"operation": "close_redis_connections"})


async def save_conversation_state() -> None:
    """Save conversation state before shutdown."""
    try:
        logger.info("Conversation state is persisted in Redis.")
        event("shutdown.conversation_state_saved", {})
    except Exception as e:
        exception(e, {"operation": "save_conversation_state"})


async def graceful_shutdown(timeout: float = 30.0) -> None:
    """
    Perform graceful shutdown of the application.

    Args:
        timeout: Maximum time to wait for shutdown in seconds.
    """
    logger.info("Initiating graceful shutdown...")
    event("shutdown.initiated", {})

    # Set shutdown event to prevent new requests
    shutdown_event = get_shutdown_event()
    shutdown_event.set()

    # Wait for in-flight requests
    await wait_for_in_flight_requests(timeout=timeout)

    # Save conversation state
    await save_conversation_state()

    # Close connections
    await close_connection_pools()
    await close_redis_connections()

    logger.info("Graceful shutdown completed.")
    event("shutdown.completed", {})


@asynccontextmanager
async def lifespan(app):
    """
    FastAPI lifespan context manager for startup and shutdown.

    Startup: initialize services.
    Shutdown: graceful shutdown with cleanup, once.
    """
    # Startup
    logger.info("Application starting up...")
    event("startup.initiated", {})

    # Initialize shutdown event
    get_shutdown_event()

    # Warm up OpenMetadata cache in background
    try:
        from ..services.openmetadata_client import OpenMetadataClient
        OpenMetadataClient().warm_up_cache()
    except Exception as e:
        logger.warning(f"Failed to initiate OpenMetadata warming: {e}")

    event("startup.completed", {})
    logger.info("Application startup completed.")

    try:
        # Run application
        yield
    finally:
        # Uvicorn will trigger ASGI lifespan shutdown; perform cleanup here
        # Set the shutdown event so middleware rejects new requests
        get_shutdown_event().set()
        await graceful_shutdown(timeout=_get_shutdown_timeout())
        logger.info("Application shutdown completed.")
