"""Application entry point.

Boot: ``python -m uvicorn app.main:app`` from the backend venv
(never the PATH ``uvicorn`` binary — broken Termux stub).

Single-origin deployment (base spec REQ-04, design ADR-2): this app serves
the REST API under /api/v1 AND the built SPA from the same origin — no
CORS. Stored photo uploads are served at /uploads through a guarded static
route mounted before the SPA. The SPA build is served from ``frontend/dist``
at ``/`` whenever the directory exists at app-creation time; without a
build the mount is skipped (html=True needs the directory to exist), so
API-only deployments and the test suite are unaffected.
"""

import os
from pathlib import Path

from fastapi import FastAPI, Request
from starlette.responses import FileResponse
from starlette.routing import Match, Route
from starlette.staticfiles import StaticFiles

from app.core.config import settings
from app.core.paths import static_dir as _static_dir
from app.modules.access_logs.router import router as access_logs_router
from app.modules.auth.router import router as auth_router
from app.modules.designs.router import router as designs_router
from app.modules.formulas.router import router as formulas_router
from app.modules.formula_designs.router import router as formula_designs_router
from app.modules.inventory.router import router as inventory_router
from app.modules.pantone_colors.router import router as pantone_router
from app.modules.samples.router import router as samples_router
from app.modules.samples.uploads import _UploadsRoute
from app.modules.users.router import router as users_router

API_PREFIX = "/api/v1"

# Repo-root-relative SPA build: resolved via portable path helper.
FRONTEND_DIST = _static_dir()


class _SPARoute(Route):
    """Serve the built SPA at ``/`` with client-side-routing fallback.

    A plain ``Mount("/", StaticFiles(...))`` matches every path, so any route
    registered after it (e.g. tests' dynamic routes) is shadowed. This route
    instead yields (``Match.NONE``) for non-HTTP scopes and for any path under
    ``/api/`` or ``/uploads/``, letting the router keep walking to the API and
    uploads routes; everything else is served from ``frontend/dist``.

    Unlike a bare ``StaticFiles(html=True)`` — which only turns *directory*
    requests into ``index.html`` and returns 404 for arbitrary client-routed
    paths such as ``/search`` or ``/formulas`` — this handler resolves the
    requested path against the build directory through a safe, path-traversal
    guarded ``lookup_path`` and serves it when it is a real file (e.g. the
    bundled ``/assets/*.js`` and ``/assets/*.css``), otherwise it falls back to
    ``index.html`` so React Router handles the route (SPA refresh / deep-link
    fallback, bugfix). The ``/uploads/`` guard mirrors ``_UploadsRoute`` so the
    SPA catch-all can never capture upload paths even if the upload route is
    re-ordered (ADR-2 double guard, order-independent).
    """

    def __init__(self, dist_dir: Path):
        self._static = StaticFiles(directory=dist_dir)
        self._index = dist_dir / "index.html"
        super().__init__(
            "/{path:path}",
            self._handle,
            name="spa",
            include_in_schema=False,
        )

    def matches(self, scope):
        if scope.get("type") != "http":
            return Match.NONE, scope
        path = scope["path"]
        if path.startswith("/api") or path == "/uploads" or path.startswith(
            "/uploads/"
        ):
            return Match.NONE, scope
        return super().matches(scope)

    async def _handle(self, request: Request) -> FileResponse:
        # ``{path:path}`` capture; root ("/") yields "".
        # URL-decode and strip the leading slash to mirror StaticFiles.
        captured = request.path_params.get("path", "") or ""
        relative = captured.lstrip("/")
        full_path, stat = self._static.lookup_path(relative)
        if stat is not None and os.path.isfile(full_path):
            return self._static.file_response(full_path, stat, request.scope)
        # No real file matched: client-routed path → SPA fallback.
        return FileResponse(self._index)


def _mount_spa(app: FastAPI) -> None:
    """Serve the SPA build at ``/`` when a build exists (single-origin).

    The route is appended last so the REST routes keep matching first.
    CORS is never enabled — browser and API share one origin (ADR-2).
    """
    if FRONTEND_DIST.is_dir():
        app.router.routes.append(_SPARoute(FRONTEND_DIST))


def create_app() -> FastAPI:
    """Build the FastAPI application with the versioned REST routers."""
    app = FastAPI(title=settings.app_name)
    app.include_router(auth_router, prefix=API_PREFIX)
    app.include_router(users_router, prefix=API_PREFIX)
    app.include_router(pantone_router, prefix=API_PREFIX)
    app.include_router(formulas_router, prefix=API_PREFIX)
    app.include_router(formula_designs_router, prefix=API_PREFIX)
    app.include_router(designs_router, prefix=API_PREFIX)
    app.include_router(inventory_router, prefix=API_PREFIX)
    app.include_router(access_logs_router, prefix=API_PREFIX)
    app.include_router(samples_router, prefix=API_PREFIX)
    # Guarded /uploads static mount before the SPA catch-all (design ADR-2):
    # neither tree can shadow the other, in either registration order.
    app.router.routes.append(_UploadsRoute())
    _mount_spa(app)
    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn
    from app.core.port import find_free_port

    port = find_free_port(8000)
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
    )