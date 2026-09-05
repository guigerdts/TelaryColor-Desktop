# Delta for portable-startup

## ADDED Requirements

### Requirement: Frozen Resource Layout — Standalone/OneDir Only

The system MUST resolve frozen resources (`alembic/`, `alembic.ini`, `frontend/dist`) relative to the executable directory. The frozen bundle MUST be standalone (Nuitka) or onedir (PyInstaller); onefile mode SHALL NOT be used, as it extracts to a temp directory and breaks exe-relative resolution.

#### Scenario: Frozen resources resolve beside the exe

- GIVEN a standalone/onedir bundle (Nuitka `__compiled__` or PyInstaller `sys.frozen`)
- WHEN `migrations_dir()` and `static_dir()` are called
- THEN they resolve to `<exe>/alembic` and `<exe>/frontend/dist`

#### Scenario: Onefile rejected as invalid layout

- GIVEN packaging guidance for the frozen backend
- WHEN onefile mode is proposed
- THEN it MUST be rejected, because resources would not sit beside the exe

## MODIFIED Requirements

### Requirement: Dev vs Frozen Data Location

The system MUST distinguish dev and frozen execution via `sys.frozen` (PyInstaller) OR the Nuitka `__compiled__` marker. Dev data MUST live in `<repo>/backend/data/`. Frozen data MUST live in `%APPDATA%\TelaryColor\data\`. Data directory MUST be created with `exist_ok=True` on first access.
(Previously: distinguished dev and frozen only via `sys.frozen`.)

#### Scenario: Dev data directory created

- GIVEN the app runs in dev mode
- WHEN `app_data_dir()` is called
- THEN `<repo>/backend/data/` exists and is writable

#### Scenario: Frozen data directory created

- GIVEN the app runs as a frozen exe
- WHEN `app_data_dir()` is called
- THEN `%APPDATA%\TelaryColor\data\` exists and is writable

#### Scenario: Nuitka frozen detection

- GIVEN a Nuitka-compiled exe with `__compiled__` but no `sys.frozen`
- WHEN `is_frozen()` is called
- THEN it returns True
- AND data dirs resolve to the frozen `%APPDATA%` layout

### Requirement: Entry Boot Chain (entry.py)

The system MUST provide `entry.py` as the frozen-exe entry point. Boot chain order: (1) apply Alembic migrations, (2) find a free port, (3) write `.port` + stdout log, (4) start uvicorn. Migrations MUST run through Alembic's in-process API (`alembic.config.Config` + `alembic.command.upgrade`) with an absolute `script_location` and exe-dir `prepend_sys_path`; the system MUST NOT spawn a `sys.executable -m alembic` subprocess. uvicorn MUST start with the app imported explicitly (`from app.main import app`), never via a string reference. MUST NOT auto-open a browser.
(Previously: migrations ran via a `sys.executable -m alembic` subprocess and uvicorn started via a string import.)

#### Scenario: Full boot chain

- GIVEN `entry.py` is invoked as the entry point
- WHEN it runs
- THEN migrations apply in-process, a port is selected, `.port` is written, and uvicorn starts

#### Scenario: No auto-open browser

- GIVEN `entry.py` starts uvicorn
- WHEN the server is ready
- THEN no browser is launched automatically

#### Scenario: Migrations do not spawn a subprocess

- GIVEN a boot with migrations pending
- WHEN `apply_migrations()` runs
- THEN no subprocess is spawned
- AND no `sys.executable -m alembic` call occurs

#### Scenario: In-process migration applies head on a clean database

- GIVEN a clean database and `alembic/` + `alembic.ini` staged beside the exe
- WHEN the in-process upgrade runs
- THEN all migrations through `head` apply
- AND `script_location` and `prepend_sys_path` resolve absolutely, independent of CWD

#### Scenario: Boot works with no Python interpreter

- GIVEN a frozen bundle on a host with no Python installed
- WHEN `entry.py` boots
- THEN migrations apply and the server starts (blocker fix proven)