# gateway_app/services/stream_utils.py
from __future__ import annotations

import time
from typing import Awaitable, Callable


class RateLimiter:
    def __init__(self, min_interval_secs: float = 0.25):
        self.min_interval = float(min_interval_secs)
        self._last = 0.0

    async def maybe(self, fn: Callable[[], Awaitable[None]]) -> None:
        now = time.monotonic()
        if now - self._last >= self.min_interval:
            self._last = now
            await fn()


def sanitize_markdown(text: str) -> str:
    """
    Minimal sanitization to keep Teams rendering stable during streaming.
    """
    if not text:
        return ""
    return text.replace("\r", "").replace("\x00", "")
