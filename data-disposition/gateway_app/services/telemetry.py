# gateway_app/services/telemetry.py
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, List

from .log_context import get_context

logger = logging.getLogger("telemetry")


def _merge_props(props: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    merged = dict(get_context())
    if props:
        merged.update(props)
    return merged


def event(name: str, props: Optional[Dict[str, Any]] = None) -> None:
    logger.info("event", extra={"event": {"name": name, "props": _merge_props(props)}})


def trace(message: str, props: Optional[Dict[str, Any]] = None) -> None:
    logger.info(message, extra={"trace": _merge_props(props)})


def payload(name: str, payload: Dict[str, Any]) -> None:
    """
    Emit a structured payload log. Your JsonFormatter will merge `payload` into top-level keys.
    """
    logger.info(name, extra={"payload": payload})


def exception(err: Exception, props: Optional[Dict[str, Any]] = None) -> None:
    merged = _merge_props(props or {})
    errors: List[Dict[str, Any]] = merged.get("errors") if isinstance(merged.get("errors"), list) else []
    if not errors:
        errors = [{"type": type(err).__name__, "message": str(err)}]
    merged["errors"] = errors

    logger.exception(str(err), extra={"trace": merged})
