# Design: Fase 0 — Portable Startup for Desktop

## Technical Approach

Introduce a `core/` utility layer (`paths.py`, `port.py`, `settings.py`) that every existing module consumes via import — no call-site refactoring. An `entry.py` boot script chains migrations → port selection → port-file + stdout write → uvicorn. Dev and frozen modes diverge only through `sys.frozen`; all business logic stays unchanged.

The plan-faithful approach (exploration Approach 1) is adopted with two bug fixes from MIGRATION_FASES.md §5: `exist_ok.0exist_ok=True` → `exist_ok=True` and `app_base_dir` → `app_base_dir()`.

## Architecture Decisions

### ADR-1: Preferred-Port Fallback over Random Port

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Random port (OS-assigned) | Zero conflicts but Electron can't predict the port; requires a discovery file regardless | Rejected |
| Preferred port with socket-bind fallback | Stable port for dev/debug, deterministic fallback if busy; port file handles discovery | **Chosen** |
| Port scanning range | Predictable range but race-prone; overkill for single-instance app | Rejected |

### ADR-2: %APPDATA% over Install-Dir for Frozen Data

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `%APPDATA%\TelaryColor\` | User-writable, survives reinstalls; standard Windows convention | **Chosen** |
| `<exe-dir>\data\` | Simple but breaks on read-only installs; data lost on exe update | Rejected |
| `%LOCALAPPDATA%` | Wrong semantics — meant for caches, not persistent user data | Rejected |

### ADR-3: Port-File + Stdout Discovery over Auto-Open Browser

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Auto-open browser via `webbrowser.open()` | Simple but wrong ownership — Electron owns the window in Fase 1 | Rejected |
| `.port` file + `PORT:<port>` stdout line | Clean IPC contract; Electron reads either; zero coupling to browser | **Chosen** |
| Environment variable only | Works but no persistent artifact; harder to debug | Rejected |

### ADR-4: Subprocess Migration Runner over In-Process Alembic

| Option | Tradeoff | Decision |
|--------|----------|----------|
| In-process `alembic.command.upgrade()` | Simpler but requires alembic API imports and careful config setup | Rejected |
| Subprocess `python -m alembic upgrade head` | Isolates Alembic's config loading; env vars pass DATABASE_URL cleanly; stderr captured | **Chosen** |
| Skip migrations in entry.py | Breaks frozen-exe path — no external caller applies them | Rejected |

## Data Flow — Boot Chain

```
entry.py
  │
  ├─1─ apply_migrations()
  │     └─ subprocess: python -m alembic -c <migrations_dir>/../alembic.ini upgrade head
  │        env var: DATABASE_URL = sqlite:///<db_path()>
  │
  ├─2─ find_free_port(preferred=8000)
  │     └─ socket.bind 127.0.0.1:8000 → OSError → socket.bind 127.0.0.1:0
  │
  ├─3─ write_port_file(port)
  │     └─ <app_data_dir>/.port  ←── plain text port number
  │     └─ stdout: PORT:<port>   ←── Electron Fase 1 reads via child_process
  │
  └─4─ uvicorn.run(host=127.0.0.1, port=port)
```

## Path Resolution Table

| Function | Dev (sys.frozen = False) | Frozen (sys.frozen = True) |
|----------|-------------------------|---------------------------|
| `app_base_dir()` | `Path(__file__).resolve().parents[2]` (= `backend/`) | `Path(sys.executable).parent` |
| `app_data_dir()` | `<repo>/backend/data/` | `%APPDATA%\TelaryColor\data\` |
| `app_log_dir()` | `<repo>/backend/logs/` | `%APPDATA%\TelaryColor\logs\` |
| `db_path()` | `<repo>/backend/data/telarycolor.db` | `%APPDATA%\TelaryColor\data\telarycolor.db` |
| `uploads_dir()` | `<repo>/backend/data/uploads/` | `%APPDATA%\TelaryColor\data\uploads\` |
| `migrations_dir()` | `<repo>/backend/alembic/` | `<exe>/alembic/` |
| `static_dir()` | `<repo>/frontend/dist` | `<exe>/frontend/dist` |

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/app/core/paths.py` | Create | `is_frozen()`, `app_base_dir()`, `app_data_dir()`, `app_log_dir()`, `db_path()`, `uploads_dir()`, `migrations_dir()`, `static_dir()` with `mkdir(exist_ok=True)` on mutable dirs |
| `backend/app/core/port.py` | Create | `find_free_port(preferred=8000)` — socket bind, fallback to random |
| `backend/app/core/settings.py` | Create | `@dataclass Settings` with `load(path)` — optional YAML via PyYAML, defaults when absent |
| `backend/entry.py` | Create | Boot script: `apply_migrations()` → `find_free_port()` → `write_port_file()` → `uvicorn.run()` |
| `backend/tests/test_paths.py` | Create | Unit tests for `is_frozen()`, `app_data_dir()`, `db_path()`, `uploads_dir()` in dev mode; frozen-mocked path assertions |
| `backend/app/core/config.py` | Modify | `database_url` default: `f"sqlite:///{db_path()}"` — resolved at import time |
| `backend/app/main.py` | Modify | Replace `FRONTEND_DIST` with `static_dir()`; add `if __name__ == '__main__'` uvicorn block |
| `backend/app/modules/samples/uploads.py` | Modify | Replace `Path(settings.upload_dir)` with `uploads_dir()` |
| `backend/app/modules/samples/router.py` | Modify | Replace `Path(settings.upload_dir)` with `uploads_dir()` |
| `backend/alembic.ini` | Modify | `sqlalchemy.url` fallback uses env-var override; `entry.py` passes `DATABASE_URL` |
| `backend/tests/test_config.py` | Modify | Update `database_url` default assertion to match portable path |

## Interfaces / Contracts

**New public API (`paths.py`):**

```python
def is_frozen() -> bool: ...
def app_base_dir() -> Path: ...
def app_data_dir() -> Path: ...     # mkdir(exist_ok=True)
def app_log_dir() -> Path: ...      # mkdir(exist_ok=True)
def db_path() -> Path: ...
def uploads_dir() -> Path: ...     # mkdir(exist_ok=True)
def migrations_dir() -> Path: ...
def static_dir() -> Path: ...
```

**Port discovery contract (stdout):**

```
PORT:<port_number>\n
```

Electron Fase 1 parses this line from the child process stdout stream.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `is_frozen()`, each path function in dev mode | Mock `sys.frozen`; assert path starts with repo root; assert `mkdir` called |
| Unit | `find_free_port` — preferred available, preferred busy | Mock `socket.bind` to raise `OSError`; assert fallback port > 0 |
| Unit | `Settings.load()` — YAML present / absent | Create temp YAML; assert defaults when file missing |
| Integration | `entry.py` boot chain | Run `entry.py` subprocess; assert `.port` file written; assert `PORT:` line in stdout |
| Integration | `config.py` imports portable `db_path()` | Assert `Settings().database_url` resolves to absolute path |

## Threat Matrix

| Vector | Applicability | Safe Behavior | RED Test |
|--------|---------------|---------------|----------|
| Shell commands (subprocess) | **Applicable** — `entry.py` runs `python -m alembic` via `subprocess.run` | `shell=False` (list args); 60s timeout; stderr captured; non-zero rc is warning, not crash | Assert `subprocess.run` called with list, not string; assert timeout kwarg present |
| Port binding (socket) | **Applicable** — `find_free_port` binds `127.0.0.1` | Binds `127.0.0.1` only (never `0.0.0.0`); no port exposure to network | Assert bind address is `127.0.0.1` |
| VCS/PR automation | N/A | — | — |
| Executable-file classification | N/A — no file classification logic | — | — |
| Process integration | **Applicable** — `entry.py` manages signal handlers | `SIGINT`/`SIGTERM` → `sys.exit(0)`; no orphan processes | Assert signal handlers registered |

## Migration / Rollout

No schema change. Existing dev users continue running `python -m uvicorn app.main:app` — `config.py` resolves to the same absolute path via `db_path()`. The `alembic.ini` fallback URL is overridden by `DATABASE_URL` env var in `entry.py` and in dev by `config.py` settings. First-run frozen exe creates `%APPDATA%\TelaryColor\data\` automatically. Rollback: revert 4 modified files, delete 5 new files; `database_url` falls back to old CWD-relative default.

## Open Questions

- [ ] None — all decisions confirmed in the task brief.
