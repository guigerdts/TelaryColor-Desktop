"""Health router — liveness probe for the frozen binary and CI smoke.

``GET /health`` returns 200 with ``{"status": "ok"}`` and NO authentication
so a freshly booted build can be probed before any user exists (backend
packaging smoke contract). Registered in ``create_app()`` BEFORE the SPA
catch-all mount, which would otherwise serve ``index.html`` for ``/health``
when ``frontend/dist`` is staged beside the binary.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Liveness probe: the process is up and serving HTTP."""
    return {"status": "ok"}