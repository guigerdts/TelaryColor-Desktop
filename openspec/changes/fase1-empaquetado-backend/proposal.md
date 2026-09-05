# Proposal: Fase 1 — Backend Packaging (Nuitka primary, PyInstaller fallback)

## Intent

Ship the FastAPI backend as a self-contained Windows binary — the paint-area PC runs TelaryColor with no Python installed. Two blockers stand in the way: `entry.py:apply_migrations()` shells out to `sys.executable -m alembic` (impossible in a frozen exe), and `uvicorn.run("app.main:app")` is a string import freezers cannot trace. **Naming correction:** the plan's "uitka"/"uitable"/`python -m uitka` commands are invalid — the tool is **Nuitka** (`pip install nuitka`, `python -m nuitka`).

## Scope

### In Scope
- Blocker fixes in `entry.py`: in-process Alembic (`alembic.config.Config` + `alembic.command.upgrade`, absolute `script_location`, exe-dir `prepend_sys_path`); explicit `from app.main import app`.
- `paths.py:is_frozen()` detects `sys.frozen` (PyInstaller) OR `__compiled__` (Nuitka).
- Tooling in `uitka-build/`: Nuitka script (`--standalone`, includes for `app`/`bcrypt._bcrypt`/`pydantic_core`/`python_multipart`, nofollow exclusions), PyInstaller fallback (`--onedir`, `--collect-all app`), staging script (exe + `alembic/` + `alembic.ini` + `frontend/dist`), `test_binary.sh`.
- GitHub Actions `windows-latest` job: build + validate Windows binary (Linux cannot cross-compile).
- TDD tests: `test_entry.py` in-process migration; `test_paths.py` frozen cases.
- Docs: uitka→Nuitka naming, Python version, `app.db` vs `telarycolor.db`.

### Out of Scope
Backend logic, frontend, Electron (F3), installer (F4), auto-update, release workflow (F5), `--onefile` mode.

## Capabilities

### New Capabilities
- `backend-packaging`: build scripts, dist staging layout, and binary smoke verification for the standalone Windows backend binary (Nuitka primary, PyInstaller fallback).

### Modified Capabilities
- `portable-startup`: migrations run in-process (no subprocess); frozen detection covers both freezers; frozen layout requires standalone/onedir (resources beside the exe).

## Approach

Exploration Approach 1 with corrected commands: fix blockers → harden `is_frozen()` → compile/stage/smoke locally on Linux → build and validate the Windows binary in CI. Standalone/onedir everywhere — onefile silently breaks `alembic/`, `alembic.ini`, `frontend/dist` resolution.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/entry.py` | Modified | In-process Alembic; explicit `app` import |
| `backend/app/core/paths.py` | Modified | `is_frozen()` detects both freezers |
| `uitka-build/` (4 files) | New | Build + staging + smoke scripts |
| `.github/workflows/*.yml` | New | windows-latest build/validate |
| `backend/tests/test_entry.py` | New | In-process migration path |
| `backend/tests/test_paths.py` | Modified | Nuitka frozen cases |
| `backend/requirements-build.txt` | New | nuitka, pyinstaller (build-only) |
| `MIGRATION_FASES.md` + docs | Modified | Naming, Python version |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `-m alembic` subprocess fatal when frozen | High | In-process API; test before any build |
| Onefile breaks exe-dir resources | High | standalone/onedir enforced; staging |
| Nuitka misses `sys.frozen` → wrong layout | Med | Also check `__compiled__` |
| Electron SIGTERM = hard kill on Windows | Med (accepted) | Define graceful-shutdown behavior in design; SQLite WAL tolerates kills |
| Lazy `python-multipart` → uploads fail | Med | Explicit include; smoke POST |
| Python 3.12 vs 3.13 mismatch | Med | Target 3.13.x; verify wheels in CI |
| Binary > 200 MB | Med | Nofollow, strip, CI size gate |

## Rollback Plan

Per-file revert: restore `entry.py`/`paths.py`; delete `uitka-build/`, workflow, new tests. No schema/data change — in-process and subprocess migrations produce identical DB state. `requirements.txt` untouched (build deps isolated).

## Dependencies

- Nuitka needs MSVC on the Windows build host (preinstalled on CI).
- GitHub Actions for the Windows artifact.
- `frontend/dist` (exists) for the optional SPA smoke check.

## Success Criteria

- [ ] `pytest` green incl. `test_entry.py` in-process migration tests.
- [ ] Linux standalone build boots: migrations → port → `.port` → health 200.
- [ ] Windows CI builds and validates `telarycolor-server.exe`.
- [ ] Binary < 200 MB; starts < 3 s.
- [ ] `is_frozen()` unit-tested for both markers.
- [ ] Docs corrected (Nuitka naming, 3.13.x).

**Open product question (non-blocking, for user review):** Python 3.13 vs 3.12 — default **3.13.x** unless a dependency forces 3.12; CI pins the same version everywhere.