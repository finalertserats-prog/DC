# gateway_app/services/log_context.py
from __future__ import annotations

from contextvars import ContextVar
from typing import Any, Dict, Optional, Iterable, Iterator
from contextlib import contextmanager


_context: ContextVar[Dict[str, Any]] = ContextVar("log_context", default={})


def get_context() -> Dict[str, Any]:
    return dict(_context.get())


def set_context(context: Dict[str, Any]) -> None:
    _context.set(dict(context or {}))


def bind_context(**kwargs: Optional[Any]) -> None:
    current = dict(_context.get())
    for key, value in kwargs.items():
        if value is not None:
            current[key] = value
    _context.set(current)


def unbind_context(*keys: str) -> None:
    if not keys:
        return
    current = dict(_context.get())
    for k in keys:
        current.pop(k, None)
    _context.set(current)


def clear_context() -> None:
    _context.set({})


def push_context(**kwargs: Optional[Any]):
    current = dict(_context.get())
    for key, value in kwargs.items():
        if value is not None:
            current[key] = value
    token = _context.set(current)
    return token


def reset_context(token) -> None:
    _context.reset(token)


@contextmanager
def with_context(**kwargs: Optional[Any]) -> Iterator[None]:
    token = push_context(**kwargs)
    try:
        yield
    finally:
        reset_context(token)
