# gateway_app/infra/logging_config.py
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from gateway_app.services.log_context import get_context


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # keep nested context
        record.context = get_context()
        return True


class JsonFormatter(logging.Formatter):
    def _opt(self, record: logging.LogRecord, name: str) -> Optional[Any]:
        v = getattr(record, name, None)
        return v if v not in (None, "", {}, []) else None

    def format(self, record: logging.LogRecord) -> str:
        out: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        ctx = self._opt(record, "context")
        if ctx:
            out["context"] = ctx

        # payload gets merged into top-level (your schema root)
        payload = self._opt(record, "payload")
        if payload:
            if isinstance(payload, dict):
                out.update(payload)
            else:
                out["payload"] = payload

        for key in ("event", "trace", "audit"):
            v = self._opt(record, key)
            if v:
                out[key] = v

        if record.exc_info:
            out["exception"] = self.formatException(record.exc_info)

        return json.dumps(out, ensure_ascii=False, default=str)


def configure_logging() -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(ContextFilter())
    handler.setFormatter(JsonFormatter())

    # replace existing handlers to avoid double logs (uvicorn + app)
    for h in list(root.handlers):
        root.removeHandler(h)
    root.addHandler(handler)

    logging.captureWarnings(True)
