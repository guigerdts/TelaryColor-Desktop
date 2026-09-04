# Exploration: fase0-arranque-portable-desktop

**Change:** fase0-arranque-portable-desktop
**Artifact Store:** openspec
**Date:** 2026-09-04

## Current State

The TelaryColor backend is a standard FastAPI/SQLite app designed to run from `backend/` via `python -m uvicorn app.main:app`. All paths are CWD-relative with no portable resolution. There is no dynamic port selection, no entry script for a frozen exe, and no mechanism to distinguish dev vs. bundled execution.

### Path Configuration Today

| Concern | Current mechanism | File | Line | Problem |
|---------|-------------------|------|------|---------|
| Database | `sqlite:///./data/app.db` | `backend/app/core/config.py` | 19 | CWD-relative. Breaks if exe CWD differs from `backend/`. |
| Uploads | `data/uploads/` | `backend/app/core/config.py` | 26 | CWD-relative. Same CWD issue. |
| SPA dist | `Path(__file__).resolve().parents[2] / "frontend" / "dist"` | `backend/app/main.py` | 38 | Uses `__file__` parents — works in dev but `__file__` is meaningless inside a uitka/PyInstaller bundle. |
| Alembic migrations | `sqlalchemy.url = sqlite:///./data/app.db` | `backend/alembic.ini` | 9 | CWD-relative fallback URL. `env.py` line 33 falls back to `settings.database_url` which is also CWD-relative. |

**Port:** No port configuration exists in the codebase. Uvicorn is invoked externally (`python -m uvicorn app.main:app`) with no `--host` or `--port` args visible in code. The app has no `if __name__ == '__main__'` block.

**Entry point:** External uvicorn invocation. No `entry.py` or standalone boot script exists.

### Files Currently in `backend/app/core/`

Only three files:
- `config.py` — pydantic-settings with hardcoded CWD-relative defaults
- `deps.py` — dependency injection (auth, DB sessions)
- `security.py` — JWT/password hashing

No `paths.py`, `port.py`, or `settings.py` exist.

## Plan Prescription vs. Current Code (Gap Analysis)

The MIGRATION_FASES.md §5 prescribes 5 files + 4 file modifications:

### Files to CREATE (none exist yet)

| File | Plan spec | Gap |
|------|-----------|-----|
| `backend/app/core/paths.py` | Portable path resolution with `is_frozen()`, `app_base_dir()`, `app_data_dir()`, `app_log_dir()`, `db_path()`, `uploads_dir()`, `migrations_dir()`, `static_dir()` | **Full gap** — file does not exist |
| `backend/app/core/port.py` | `find_free_port(preferred=8000)` using socket bind | **Full gap** — file does not exist |
| `backend/entry.py` | Boot script: apply migrations → find port → write port file → start uvicorn with signal handling | **Full gap** — file does not exist |
| `backend/app/core/settings.py` | Optional YAML config dataclass (port, tray, backup, theme) | **Full gap** — file does not exist |
| `backend/tests/test_paths.py` | Tests for `is_frozen()`, `app_data_dir()`, `db_path()` in dev and frozen modes | **Full gap** — file does not exist |

### Files to MODIFY (current state)

| File | What plan requires | Current state |
|------|--------------------|---------------|
| `backend/app/core/config.py` | Use `db_path()` from paths.py instead of hardcoded `"sqlite:///./data/app.db"` | Line 19: `database_url: str = "sqlite:///./data/app.db"` — hardcoded CWD-relative |
| `backend/app/main.py` | Use `static_dir()` from paths.py for SPA mount | Line 38: `FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"` — `__file__`-based, breaks in frozen exe |
| `backend/app/main.py` | Add `if __name__ == '__main__'` block with uvicorn + dynamic port | No `__main__` block exists |
| `backend/app/modules/samples/uploads.py` | Use `uploads_dir()` from paths.py | Line 85/226: uses `Path(settings.upload_dir)` — CWD-relative |
| `backend/alembic.ini` | Use `migrations_dir()` for migration path | Line 9: `sqlalchemy.url = sqlite:///./data/app.db` — hardcoded CWD-relative |

### Bugs in the plan's code

The plan's `paths.py` (line 386) contains a typo: `exist_ok.0exist_ok=True` — should be `exist_ok=True`. The plan's `static_dir()` (line 413) uses `app_base_dir` (missing parentheses) instead of `app_base_dir()`. These must be fixed during apply.

## Affected Areas

- `backend/app/core/config.py` — must integrate `db_path()` into `database_url` default
- `backend/app/main.py` — must use `static_dir()` and add `__main__` uvicorn block with dynamic port
- `backend/app/modules/samples/uploads.py` — must use `uploads_dir()` instead of `Path(settings.upload_dir)`
- `backend/app/modules/samples/router.py` — line 226: also uses `Path(settings.upload_dir)` directly
- `backend/alembic.ini` — hardcoded `sqlalchemy.url` must become dynamic or use `migrations_dir()`
- `backend/alembic/env.py` — line 33: falls back to `settings.database_url`, inherits the CWD issue
- `backend/app/db/session.py` — line 47: creates engine from `settings.database_url`, inherits CWD issue
- `backend/tests/test_config.py` — asserts `"sqlite:///./data/app.db"` as default (line 17); will break when default changes to portable path

## Approaches

### 1. Plan-faithful implementation (follow §5 as written, with bug fixes)

- Create all 5 files exactly as prescribed (fixing typos)
- Modify the 4 target files to integrate paths.py/port.py
- Pros: Aligns with the migration plan; minimal design decisions
- Cons: Plan's `settings.py` (YAML config) is optional and adds a dependency (`pyyaml`); plan's `entry.py` subprocess-based migration approach duplicates alembic's env.py logic
- Effort: Low

### 2. Minimal paths-only (skip optional settings.py and entry.py initially)

- Create `paths.py` and `port.py` only
- Modify `config.py`, `main.py`, `uploads.py` to use portable paths
- Add `__main__` block to `main.py` (simpler than separate `entry.py`)
- Skip `settings.py` (YAML config) — not needed for Phase 0 core functionality
- Pros: Fewer files, fewer dependencies, still achieves portable path resolution
- Cons: Defer entry.py and settings.py to later; entry.py's migration bootstrap is useful for frozen exe
- Effort: Low

### 3. Full integration with entry.py boot chain

- All 5 files + entry.py with migration bootstrap + graceful shutdown + port file for Electron
- Pros: Complete Fase 0 as designed; Electron has a clean discovery mechanism (port file)
- Cons: More code surface; subprocess-based migration in entry.py duplicates env.py
- Effort: Medium

## Recommendation

**Approach 1 (plan-faithful with bug fixes)** — the scope is small (5 files, 4 modifications), the plan is well-documented, and skipping pieces creates debt that Fase 1 (uitka packaging) will need immediately. The plan's bugs are trivial to fix. The optional `settings.py` should be included since it costs nothing and Fase 2+ will need tray/backup config anyway.

Key implementation decisions for the proposal:
1. `config.py` should dynamically resolve `database_url` using `db_path()` at Settings instantiation, not just replace the hardcoded string
2. `main.py`'s `FRONTEND_DIST` must use `static_dir()` from paths.py with the frozen exe fallback
3. The `__main__` block in `main.py` should be minimal (uvicorn + dynamic port); the full entry.py boot chain (migrations + port file) is for the frozen exe path
4. `uploads.py` and `samples/router.py` should both consume `uploads_dir()` instead of `Path(settings.upload_dir)` independently

## Risks

- **Test breakage in test_config.py:** The default `database_url` will change from `"sqlite:///./data/app.db"` to a portable absolute path. Tests that assert the old default must be updated. (Low risk — test update is mechanical.)
- **Alembic migration path resolution:** The frozen exe's alembic.ini path is CWD-relative. When running from uitka, `alembic` needs `script_location` to resolve against `app_base_dir()`. This requires either patching alembic.ini at runtime or using `migrations_dir()` in env.py. (Medium risk — needs careful testing.)
- **PyYAML dependency:** `settings.py` imports `yaml`. If the project doesn't already depend on PyYAML, this adds a dependency. (Low risk — can check requirements.txt.)
- **Plan code bugs:** `paths.py` has typos (`exist_ok.0exist_ok=True`, `app_base_dir` without parens). Must be caught during apply. (Negligible risk.)

## Ready for Proposal

Yes. The codebase is well-structured, the gaps are clear and bounded, and the plan provides concrete code to follow. The proposal should:
1. Confirm the 5-file + 4-modification scope
2. Call out the plan bugs to fix
3. Decide whether `settings.py` (YAML) is in scope (recommend yes)
4. Note the test_config.py update needed
