# Base Architecture Specification

## Purpose

Cross-cutting infrastructure: the data layer, schema management, single-origin deployment, PWA shell, and run/test entry points that all capability modules share.

## Requirements

### Requirement: Data Layer (SQLite + SQLAlchemy 2.0)

The system MUST use SQLite with SQLAlchemy 2.0 to persist all eight tables: `users`, `access_logs`, `pantone_colors`, `formulas`, `formula_ingredients`, `designs`, `design_colors`, `samples`.
(Previously: listed seven tables, without `samples`)

#### Scenario: Database available

- GIVEN a fresh backend
- WHEN it boots
- THEN the configured SQLite database is available for all modules

### Requirement: Single Initial Migration (Alembic)

The system MUST use Alembic. The base `0001_initial` migration creates the seven original tables; the additive `0002_samples` migration adds the `samples` table. Alembic MUST import all module metadata so no table is missing.
(Previously: a single initial migration creating all seven tables)

#### Scenario: Fresh upgrade

- GIVEN a clean database
- WHEN `alembic upgrade head` runs
- THEN all eight tables are created

#### Scenario: Already applied

- GIVEN the migrations already applied
- WHEN they run again
- THEN Alembic reports no pending changes

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

### Requirement: Single-Origin Deployment

The system MUST serve the built frontend from FastAPI so frontend and API share one origin, and MUST NOT enable CORS.

#### Scenario: SPA served from same origin

- GIVEN `frontend/dist` is built
- WHEN served by FastAPI
- THEN the SPA loads from the same origin as the API without CORS

### Requirement: PWA Shell (manifest + icons only)

The frontend MUST include a web app manifest and icons so it can be installed, and MUST NOT implement offline service-worker caching in Fase 1.

#### Scenario: Installable manifest

- GIVEN a built frontend
- WHEN inspected
- THEN a manifest and icons are present for installability

#### Scenario: No offline caching

- GIVEN a browser request for offline operation
- WHEN no service worker is registered
- THEN the app continues to require a network connection

### Requirement: Strict TDD

Backend behavior MUST be covered by pytest and frontend behavior by Vitest, following strict TDD (red-green-refactor). The backend test command is `pytest`; the frontend test command is `npm test`.

#### Scenario: Backend red-green

- GIVEN a new backend behavior
- WHEN implemented
- THEN a failing pytest case is written first, then made green

#### Scenario: Frontend red-green

- GIVEN a new frontend behavior
- WHEN implemented
- THEN a failing Vitest case is written first, then made green

### Requirement: Shared Theme with Brand Accent 281C

The system SHALL provide a shared frontend theme carrying the brand accent Pantone 281C as `#00205B`. The accent MAY be used for brand elements (accents, highlights, interactive states) and MUST NOT be used as a dominant full-screen background, avoiding the "all-dark-blue" anti-pattern.

#### Scenario: Accent token present

- GIVEN the shared theme
- WHEN the theme tokens are inspected
- THEN an `#00205B` accent token is defined for reuse across screens

#### Scenario: Accent not dominant

- GIVEN a screen using the shared theme
- WHEN the accent is applied
- THEN it appears as an accent, not as the dominant background

### Requirement: Impeccable Retrofit of Existing Screens

The system SHALL retrofit the existing Fase 1–3 screens (Formulas/Search, Inventory, InventoryTransaction, InventoryAlerts) guided by an Impeccable audit, addressing relevant findings or documenting them as out of scope. Low-risk passive layout/theme changes require no design-review ceremony beyond the ordinary test gate.

#### Scenario: Baseline audit recorded

- GIVEN the existing screens
- WHEN `/impeccable audit` runs
- THEN findings are recorded as a checklist and addressed or documented as out of scope

#### Scenario: Retrofit preserves behavior

- GIVEN a retrofitted screen
- WHEN its behavior is exercised
- THEN functionality is unchanged while visual quality improves

### Requirement: Strict TDD Applies to UI Retrofit

Any UI change introduced by the retrofit SHALL remain covered by the existing Vitest suite, following the strict TDD (red-green-refactor) standard. The backend test command is `pytest`; the frontend test command is `npm test`.

#### Scenario: Frontend red-green

- GIVEN a new frontend behavior in the retrofit
- WHEN implemented
- THEN a failing Vitest case is written first, then made green
