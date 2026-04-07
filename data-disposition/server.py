# server.py (project root)

import os
from pathlib import Path
from typing import Optional, Any

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from gateway_app.infra.logging_config import configure_logging
from gateway_app.infra.middleware import ShutdownMiddleware, RequestSizeLimitMiddleware
from gateway_app.api.tab_routes import tab_router
from gateway_app.api.auth_routes import auth_router
from gateway_app.infra.shutdown import lifespan

# Configure logging once at import time so all logs are JSON from startup onward.
configure_logging()

TABS_DIST = Path(__file__).parent / "tabs" / "dist"


def create_app() -> FastAPI:
    app = FastAPI(title="Nova Gateway", lifespan=lifespan)

    # Middlewares
    app.add_middleware(RequestSizeLimitMiddleware)
    app.add_middleware(ShutdownMiddleware)

    # Auth API (Google OAuth + JWT)
    app.include_router(auth_router)

    # Tab API (REST + SSE for the React chat UI)
    app.include_router(tab_router)

    # Attachment / chart serving
    from gateway_app.services.attachment_store import attachment_store

    @app.get("/api/attachments/{file_id}/{filename}")
    @app.get("/api/charts/{file_id}")
    async def serve_attachment(file_id: str, filename: Optional[str] = None):
        result = attachment_store.get(file_id)
        if result is None:
            return JSONResponse({"error": "File not found or expired"}, status_code=404)
        data, content_type = result
        headers = {}
        if content_type == "text/csv":
            headers["Content-Disposition"] = f'attachment; filename="{filename or "export.csv"}"'
        return Response(content=data, media_type=content_type, headers=headers)

    # Health endpoints (no Teams dependencies)
    @app.get("/health")
    async def health():
        from gateway_app.services.server_utils import health_status
        return await health_status()

    @app.get("/health/ready")
    async def health_ready():
        from gateway_app.services.server_utils import readiness_status
        from fastapi import status as http_status
        status_data = await readiness_status()
        if not status_data["ready"]:
            return JSONResponse(status_code=503, content=status_data)
        return status_data

    @app.get("/health/live")
    async def health_live():
        from gateway_app.services.server_utils import liveness_status
        return liveness_status()

    @app.get("/meta")
    async def meta():
        return {
            "service": "nova-gateway",
            "version": "3.0.0",
            "mode": "standalone-web",
        }

    # Serve built React Tab UI ------------------------------------------------
    if TABS_DIST.is_dir():
        assets_dir = TABS_DIST / "assets"
        if assets_dir.is_dir():
            # Serve under /tabs/assets (for base="/tabs/" builds)
            app.mount(
                "/tabs/assets",
                StaticFiles(directory=str(assets_dir)),
                name="tab-assets",
            )
            # Also serve under /assets (fallback for base="/" builds)
            app.mount(
                "/assets",
                StaticFiles(directory=str(assets_dir)),
                name="tab-assets-root",
            )

        # Serve other dist root files (bot.png, sw.js, etc.)
        @app.get("/bot.png")
        async def _serve_bot_png():
            return FileResponse(str(TABS_DIST / "bot.png"))

        @app.get("/sw.js")
        async def _serve_sw_js():
            return FileResponse(str(TABS_DIST / "sw.js"), media_type="application/javascript")

        import time as _time
        _BUILD_VER = str(int(_time.time()))

        @app.get("/tabs")
        @app.get("/tabs/{rest_of_path:path}")
        async def _serve_tab(rest_of_path: str = ""):
            if rest_of_path.startswith("api/"):
                return JSONResponse({"error": "Not found"}, status_code=404)
            html = (TABS_DIST / "index.html").read_text(encoding="utf-8")
            html = html.replace("</head>", f'<meta name="build-ver" content="{_BUILD_VER}"></head>', 1)
            return Response(
                content=html,
                media_type="text/html",
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

        # Redirect root to /tabs
        @app.get("/")
        async def root_redirect():
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/tabs")

    else:
        @app.get("/tabs")
        @app.get("/tabs/{rest_of_path:path}")
        async def _tab_not_built(rest_of_path: str = ""):
            return JSONResponse(
                {
                    "error": "Tab UI not built",
                    "hint": "Run:  cd tabs && npm install && npm run build",
                },
                status_code=404,
            )

    return app


app = create_app()


if __name__ == "__main__":
    host = os.getenv("TEAMS_GATEWAY_HOST", "0.0.0.0")
    port = int(os.getenv("TEAMS_GATEWAY_PORT", "8000"))

    config = uvicorn.Config(
        "server:app",
        host=host,
        port=port,
        ws="websockets-sansio",
        timeout_graceful_shutdown=15,
        log_level="info",
        reload=False,
    )
    uvicorn.Server(config).run()
