"""Health endpoint — liveness probe for the frozen binary and CI smoke.

Scenarios (backend-packaging spec "Binary Smoke Verification" + smoke
contract):

- ``GET /health`` returns 200 with ``{"status": "ok"}`` and a JSON
  content-type — the binary's booted probe, never an HTML page.
- The route MUST be reachable WITHOUT authentication — ``/health`` has no
  ``Depends(get_current_user)``; unlike ``/auth/*`` it must answer before
  any user exists, so the smoke harness can probe a freshly booted build.

Registration order matters: ``create_app()`` mounts the SPA catch-all at
``/`` last, and with a ``frontend/dist`` build present the ``_SPARoute``
fallback would otherwise serve ``index.html`` for ``/health`` (200 but
HTML — the probe would never see JSON). The health router is registered
before that mount.
"""


def test_health_returns_ok(client):
    """GET /health returns 200 JSON {"status": "ok"}.

    The content-type assertion proves this is the real route's JSON, not
    the SPA catch-all fallback: with frontend/dist staged, a shadowed
    /health would return 200 with ``text/html`` index.html instead.
    """
    response = client.get("/health")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"status": "ok"}


def test_health_no_auth_required(client):
    """Anonymous GET /health succeeds without any Authorization header.

    The health probe must answer before any user exists (smoke contract):
    /api/v1/auth/* routes would reject this request with 401, /health must
    not depend on ``get_current_user`` at all.
    """
    response = client.get("/health", headers={})

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}