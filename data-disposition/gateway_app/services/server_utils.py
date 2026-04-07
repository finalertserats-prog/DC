# gateway_app/services/server_utils.py
import asyncio
import time
import uuid
from typing import Dict, Any, Optional

from ..config.settings import settings
from .conversation_store_redis import RedisConversationStore
from .llm_client import LLMClient

_redis_status: Optional[Dict[str, Any]] = None
_llm_status: Optional[Dict[str, Any]] = None
_om_status: Optional[Dict[str, Any]] = None
_sf_status: Optional[Dict[str, Any]] = None
_sr_status: Optional[Dict[str, Any]] = None
_last_probe = 0.0


def new_correlation_id() -> str:
    return uuid.uuid4().hex


async def _probe_redis() -> Dict[str, Any]:
    """Probe Redis connectivity."""
    start_time = time.time()
    try:
        store = RedisConversationStore()
        store._redis.ping()
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": True, "latency_ms": round(elapsed_ms, 2), "error": None}
    except Exception as e:
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": str(e)}


async def _probe_llm() -> Dict[str, Any]:
    """Probe LLM API connectivity with a minimal request."""
    start_time = time.time()
    if not settings.LLM_HEALTHCHECK_ENABLED:
        return {"ok": True, "latency_ms": 0, "error": None, "skipped": True}
    try:
        client = LLMClient()
        test_messages = [{"role": "user", "content": "ping"}]
        try:
            result = await asyncio.wait_for(
                client.async_client.chat.completions.create(
                    model=settings.LLM_MODEL,
                    messages=test_messages,
                    max_completion_tokens=5,
                    temperature=1,
                ),
                timeout=5.0,
            )
            elapsed_ms = (time.time() - start_time) * 1000
            return {"ok": True, "latency_ms": round(elapsed_ms, 2), "error": None}
        except asyncio.TimeoutError:
            elapsed_ms = (time.time() - start_time) * 1000
            return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": "Request timeout"}
    except Exception as e:
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": str(e)}


async def _probe_openmetadata() -> Dict[str, Any]:
    """Probe OpenMetadata API connectivity."""
    start_time = time.time()
    try:
        from .openmetadata_client import OpenMetadataClient

        om = OpenMetadataClient()
        tables = om.get_tables()
        elapsed_ms = (time.time() - start_time) * 1000
        return {
            "ok": True,
            "latency_ms": round(elapsed_ms, 2),
            "error": None,
            "tables_found": len(tables) if tables else 0,
        }
    except Exception as e:
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": str(e)}


async def _probe_snowflake() -> Dict[str, Any]:
    """Probe Snowflake connectivity with a lightweight query."""
    start_time = time.time()
    try:
        from .snowflake_executor import SnowflakeExecutor

        sf = SnowflakeExecutor()
        result = sf.execute("SELECT 1 AS health_check")
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": True, "latency_ms": round(elapsed_ms, 2), "error": None}
    except Exception as e:
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": str(e)}


async def _probe_starrocks() -> Dict[str, Any]:
    """Probe StarRocks connectivity with a lightweight query."""
    start_time = time.time()
    try:
        from .starrocks_executor import StarRocksExecutor

        sr = StarRocksExecutor()
        if sr.is_healthy():
            elapsed_ms = (time.time() - start_time) * 1000
            return {"ok": True, "latency_ms": round(elapsed_ms, 2), "error": None}
        else:
            elapsed_ms = (time.time() - start_time) * 1000
            return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": "is_healthy returned False"}
    except Exception as e:
        elapsed_ms = (time.time() - start_time) * 1000
        return {"ok": False, "latency_ms": round(elapsed_ms, 2), "error": str(e)}


async def _probe_all() -> None:
    """Probe all dependencies and cache results."""
    global _redis_status, _llm_status, _om_status, _sf_status, _sr_status, _last_probe
    now = time.time()
    if now - _last_probe < 5:
        return
    _last_probe = now

    tasks = {
        "redis": _probe_redis(),
        "llm": _probe_llm(),
        "openmetadata": _probe_openmetadata(),
        "snowflake": _probe_snowflake(),
        "starrocks": _probe_starrocks(),
    }

    results = await asyncio.gather(*tasks.values(), return_exceptions=True)

    for name, result in zip(tasks.keys(), results):
        if isinstance(result, Exception):
            val = {"ok": False, "latency_ms": 0, "error": str(result)}
        else:
            val = result

        if name == "redis":
            _redis_status = val
        elif name == "llm":
            _llm_status = val
        elif name == "openmetadata":
            _om_status = val
        elif name == "snowflake":
            _sf_status = val
        elif name == "starrocks":
            _sr_status = val


def _probe() -> None:
    """Synchronous wrapper for async probe (for backward compatibility)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            return
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    loop = asyncio.get_event_loop()
    loop.run_until_complete(_probe_all())


async def health_status() -> Dict[str, Any]:
    """Get comprehensive health status of all components."""
    await _probe_all()

    components = {}
    all_ok = True

    for name, status in [
        ("redis", _redis_status),
        ("llm", _llm_status),
        ("openmetadata", _om_status),
        ("snowflake", _sf_status),
        ("starrocks", _sr_status),
    ]:
        if status:
            components[name] = status
            if not status["ok"]:
                all_ok = False
        else:
            components[name] = {"ok": False, "latency_ms": 0, "error": "Not probed yet"}
            all_ok = False

    return {
        "ok": all_ok,
        "components": components,
        "env": {
            "llm_model": settings.LLM_MODEL,
            "redis_url": settings.REDIS_URL,
            "openmetadata_url": settings.OPENMETADATA_URL,
            "snowflake_account": settings.SNOWFLAKE_ACCOUNT,
            "starrocks_host": settings.STARROCKS_HOST,
        },
    }


def health_status_sync() -> Dict[str, Any]:
    """Synchronous version of health_status."""
    _probe()
    return {
        "ok": bool(
            _redis_status and _redis_status["ok"]
            and _llm_status and _llm_status["ok"]
        ),
        "components": {
            "redis": _redis_status or {"ok": False, "latency_ms": 0, "error": "Not probed yet"},
            "llm": _llm_status or {"ok": False, "latency_ms": 0, "error": "Not probed yet"},
            "openmetadata": _om_status or {"ok": False, "latency_ms": 0, "error": "Not probed yet"},
            "snowflake": _sf_status or {"ok": False, "latency_ms": 0, "error": "Not probed yet"},
            "starrocks": _sr_status or {"ok": False, "latency_ms": 0, "error": "Not probed yet"},
        },
        "env": {
            "llm_model": settings.LLM_MODEL,
            "redis_url": settings.REDIS_URL,
            "openmetadata_url": settings.OPENMETADATA_URL,
            "snowflake_account": settings.SNOWFLAKE_ACCOUNT,
            "starrocks_host": settings.STARROCKS_HOST,
        },
    }


async def readiness_status() -> Dict[str, Any]:
    """Check if the service is ready to accept traffic (all critical deps are up)."""
    await _probe_all()

    critical_ok = True
    issues = []

    if not _redis_status or not _redis_status["ok"]:
        critical_ok = False
        issues.append("Redis is unavailable")

    if not _llm_status or not _llm_status["ok"]:
        critical_ok = False
        issues.append("LLM API is unavailable")

    # OpenMetadata, Snowflake, and StarRocks are important but non-critical for readiness
    # (the bot can still function as a general assistant without them)

    return {
        "ready": critical_ok,
        "issues": issues,
    }


def readiness_status_sync() -> Dict[str, Any]:
    """Synchronous version of readiness_status."""
    _probe()
    critical_ok = True
    issues = []

    if not _redis_status or not _redis_status["ok"]:
        critical_ok = False
        issues.append("Redis is unavailable")

    if not _llm_status or not _llm_status["ok"]:
        critical_ok = False
        issues.append("LLM API is unavailable")

    return {
        "ready": critical_ok,
        "issues": issues,
    }


def liveness_status() -> Dict[str, Any]:
    """Check if the service is alive (no dependency checks)."""
    return {
        "alive": True,
        "service": "teams-gateway",
    }
