"""Tests for the POST /api/v1/system/shutdown endpoint.

The shutdown endpoint is part of the portable-startup delta (Fase 2): it lets
the Electron shell trigger a graceful uvicorn drain by setting
``app.state.server.should_exit = True``. It is loopback-only (the backend
binds 127.0.0.1) and unauthenticated, sharing the health endpoint's trust
model. It must be registered BEFORE the SPA catch-all route so a shutdown
request is never swallowed by the ``index.html`` fallback.
"""
from fastapi.testclient import TestClient

from app.main import app


def test_shutdown_route_registered_before_spa_catchall():
    """The shutdown endpoint must be reachable even when the SPA catch-all is
    mounted, i.e. registered before it. Prove it by making a real request and
    asserting we get the JSON handler response, never an index.html fallback."""
    client = TestClient(app)
    resp = client.post("/api/v1/system/shutdown")
    assert resp.status_code == 200, (
        f"shutdown endpoint not reachable (or shadowed by SPA): {resp.status_code}"
    )
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json() == {"status": "shutting_down"}

    # When a SPA build is staged, the catch-all lives last in the router
    # stack, so the shutdown request above must have matched the endpoint and
    # returned JSON, not the SPA index.html fallback.
    spa_idx = None
    for i, route in enumerate(app.router.routes):
        if getattr(route, "name", None) == "spa":
            spa_idx = i
            break
    assert spa_idx is None or resp.headers["content-type"].startswith(
        "application/json"
    ), "shutdown response is HTML — the SPA catch-all shadowed the endpoint"


def test_shutdown_sets_should_exit_and_returns_200():
    """Calling the endpoint sets should_exit on a fake app.state.server and
    returns 200 with the shutting_down status."""
    class FakeServer:
        should_exit = False

    fake_server = FakeServer()

    client = TestClient(app)
    # Temporarily inject a fake server into app.state to observe should_exit.
    client.app.state.server = fake_server
    try:
        resp = client.post("/api/v1/system/shutdown")
    finally:
        del client.app.state.server

    assert resp.status_code == 200
    assert resp.json() == {"status": "shutting_down"}
    assert fake_server.should_exit is True


def test_shutdown_returns_200_when_server_missing():
    """The endpoint must not crash when app.state.server is absent (e.g. the
    app is running under uvicorn.run via app.main.__main__)."""
    client = TestClient(app)
    assert not hasattr(client.app.state, "server")
    resp = client.post("/api/v1/system/shutdown")
    assert resp.status_code == 200
    assert resp.json() == {"status": "shutting_down"}
