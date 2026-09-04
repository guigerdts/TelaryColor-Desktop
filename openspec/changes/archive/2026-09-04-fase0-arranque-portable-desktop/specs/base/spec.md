# Delta for Base

## MODIFIED Requirements

### Requirement: Application Entry Point

The system MUST boot via `python -m uvicorn app.main:app` run from the backend venv, OR via `entry.py` as the portable/frozen entry point. The `static_dir()` function from `paths.py` MUST be used for the SPA frontend mount instead of a hardcoded `__file__`-based path. A `if __name__ == '__main__'` block in `main.py` MUST start uvicorn with a dynamic port from `find_free_port()`.
(Previously: only `python -m uvicorn app.main:app` from venv; no `__main__` block; SPA path hardcoded via `__file__`)

#### Scenario: Boot from venv

- GIVEN the backend venv is activated
- WHEN `python -m uvicorn app.main:app` runs
- THEN the FastAPI app serves, `/docs` (Swagger) loads, and the API is reachable on the LAN

#### Scenario: Boot from entry.py

- GIVEN the app runs as a frozen exe or via `entry.py`
- WHEN `entry.py` is invoked
- THEN migrations apply, a port is selected, and uvicorn starts serving

#### Scenario: SPA served from portable path

- GIVEN `static_dir()` resolves the frontend dist path
- WHEN FastAPI mounts the SPA
- THEN the frontend loads from the resolved path (dev or frozen), not a hardcoded `__file__` path

#### Scenario: __main__ dynamic port

- GIVEN `main.py` is run directly (`python -m app.main`)
- WHEN the `__main__` block executes
- THEN uvicorn starts on a dynamic port from `find_free_port()`
