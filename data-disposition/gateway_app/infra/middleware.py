# gateway_app/infra/middleware.py
"""HTTP middleware classes for request size limiting and graceful shutdown."""
from __future__ import annotations

import json
import uuid

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from gateway_app.infra.shutdown import (
    is_shutting_down,
    register_in_flight_request,
    unregister_in_flight_request,
)

MAX_REQUEST_BODY_SIZE = 5 * 1024 * 1024  # 5 MB default


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                size = int(content_length)
                if size > MAX_REQUEST_BODY_SIZE:
                    return Response(
                        status_code=413,
                        content=json.dumps(
                            {
                                "error": "Request too large",
                                "details": f"Request body exceeds maximum size of {MAX_REQUEST_BODY_SIZE} bytes.",
                            }
                        ),
                        media_type="application/json",
                    )
            except ValueError:
                pass
        return await call_next(request)


class ShutdownMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if is_shutting_down():
            return Response(
                status_code=503,
                content=json.dumps(
                    {
                        "error": "Service is shutting down",
                        "details": "The service is currently shutting down and cannot accept new requests.",
                    }
                ),
                media_type="application/json",
            )

        request_id = str(uuid.uuid4())
        register_in_flight_request(request_id)
        try:
            return await call_next(request)
        finally:
            unregister_in_flight_request(request_id)
