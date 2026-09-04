# Portable Startup Specification

## Purpose

Portable path resolution, dynamic port selection, and boot/discovery contract enabling TelaryColor to run identically in dev (repo-relative) and frozen exe (%APPDATA%) contexts without touching business logic.

## Requirements

### Requirement: Portable Path Resolution

The system MUST provide path functions (`app_base_dir()`, `app_data_dir()`, `app_log_dir()`, `db_path()`, `uploads_dir()`, `migrations_dir()`, `static_dir()`) that resolve based on execution mode. Dev: relative to repo `data/`. Frozen: under `%APPDATA%\TelaryColor\`. `app_base_dir()` MUST return the module or exe root directory.

#### Scenario: Dev path resolution

- GIVEN the app runs from the repo (`python -m uvicorn` or `entry.py`)
- WHEN `db_path()` is called
- THEN it resolves to `<repo>/backend/data/app.db`

#### Scenario: Frozen path resolution

- GIVEN the app runs as a frozen exe (PyInstaller/uitka)
- WHEN `db_path()` is called
- THEN it resolves to `%APPDATA%\TelaryColor\data\app.db`

#### Scenario: Static dir in dev

- GIVEN the app runs in dev mode
- WHEN `static_dir()` is called
- THEN it resolves to `<repo>/frontend/dist`

#### Scenario: Static dir frozen falls back

- GIVEN the app runs as a frozen exe and `<exe>/frontend/dist` does not exist
- WHEN `static_dir()` is called
- THEN it returns `<exe>/frontend/dist` and the SPA mount is skipped gracefully (no app breakage)

### Requirement: Dev vs Frozen Data Location

The system MUST distinguish dev and frozen via `sys.frozen`. Dev data MUST live in `<repo>/backend/data/`. Frozen data MUST live in `%APPDATA%\TelaryColor\data\`. Data directory MUST be created with `exist_ok=True` on first access.

#### Scenario: Dev data directory created

- GIVEN the app runs in dev mode
- WHEN `app_data_dir()` is called
- THEN `<repo>/backend/data/` exists and is writable

#### Scenario: Frozen data directory created

- GIVEN the app runs as a frozen exe
- WHEN `app_data_dir()` is called
- THEN `%APPDATA%\TelaryColor\data\` exists and is writable

### Requirement: Dynamic Port Selection

The system MUST attempt to bind the preferred port (8000) and fall back to the next available port if busy. Port selection MUST use socket bind, not a hardcoded list.

#### Scenario: Preferred port available

- GIVEN port 8000 is free
- WHEN `find_free_port(preferred=8000)` is called
- THEN port 8000 is returned

#### Scenario: Preferred port busy

- GIVEN port 8000 is occupied
- WHEN `find_free_port(preferred=8000)` is called
- THEN a free port (8001 or higher) is returned

### Requirement: Port Discovery Contract

The system MUST write the selected port to a `.port` file in the app base directory and log it to stdout as `PORT:<port>`. The `.port` file MUST be overwritten on each boot. This contract enables Electron (Fase 1+) to discover the backend port.

#### Scenario: Port file written

- GIVEN the app has selected a port
- WHEN the boot completes
- THEN `<app_data_dir>/.port` contains the port number as plain text

#### Scenario: Stdout port log

- GIVEN the app has selected port 8001
- WHEN the boot completes
- THEN stdout contains a line matching `PORT:8001`

### Requirement: Entry Boot Chain (entry.py)

The system MUST provide `entry.py` as the frozen-exe entry point. Boot chain order: (1) apply Alembic migrations, (2) find a free port, (3) write `.port` + stdout log, (4) start uvicorn. MUST NOT auto-open a browser.

#### Scenario: Full boot chain

- GIVEN `entry.py` is invoked as the entry point
- WHEN it runs
- THEN migrations apply, a port is selected, `.port` is written, and uvicorn starts

#### Scenario: No auto-open browser

- GIVEN `entry.py` starts uvicorn
- WHEN the server is ready
- THEN no browser is launched automatically

### Requirement: Optional YAML Configuration

The system MAY provide a `settings.py` dataclass loading an optional YAML config for port, tray, backup, and theme overrides. When no YAML file exists, defaults MUST apply without error.

#### Scenario: YAML present

- GIVEN a `settings.yaml` exists in the app data directory
- WHEN `Settings` is instantiated
- THEN values from the YAML override defaults

#### Scenario: YAML absent

- GIVEN no `settings.yaml` exists
- WHEN `Settings` is instantiated
- THEN all defaults apply without error
