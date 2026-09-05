# Design: Fase 1 — Backend Packaging

## Technical Approach

Fix the two freezer blockers so the backend ships as a standalone Windows binary: (1) `entry.py` runs Alembic in-process (`alembic.config.Config` + `alembic.command.upgrade`, absolute `script_location`/`prepend_sys_path`, `DATABASE_URL` from `db_path()`) instead of `sys.executable -m alembic`; (2) uvicorn gets the app object via explicit `from app.main import app`, giving freezers a static trace across `app.*`. `is_frozen()` detects PyInstaller `sys.frozen` OR Nuitka `__compiled__`. `uitka-build/` (name kept per plan; contents = real Nuitka) holds compile scripts for both freezers, `stage_dist.py` (owns resource layout: exe + `alembic/` + `alembic.ini` + `frontend/dist` beside exe), cross-platform `smoke_binary.py` + `test_binary.sh`. A `windows-latest` CI job builds+validates the Windows artifact (Linux cannot cross-compile). Answers `backend-packaging` REQ-01..08 and `portable-startup` deltas.

## Architecture Decisions

### ADR-1: In-Process Alembic over Subprocess
| Option | Tradeoff | Decision |
|---|---|---|
| Subprocess `sys.executable -m alembic` (current) | Dev-only; frozen impossible — `sys.executable` IS the exe | Rejected (blocker) |
| **In-process `command.upgrade(cfg, "head")`** | Runs `env.py` in-proc; Config overrides make paths absolute; identical DB state | **Chosen** |
| Skip migrations | Unmigrated DB = silent corruption | Rejected |

### ADR-2: Nuitka Primary, PyInstaller Fallback
| Option | Tradeoff | Decision |
|---|---|---|
| **Nuitka `--standalone`** | Plan §4.1 + user directive; smaller/faster; needs MSVC (CI has it) | **Chosen** |
| PyInstaller `--onedir` | Forgiving hooks; bigger binary | Fallback script |
| Onefile (either) | Temp-dir extraction breaks exe-relative resources | Rejected |

### ADR-3: Staging Script Owns Resource Layout
| Option | Tradeoff | Decision |
|---|---|---|
| **`stage_dist.py` copies `alembic/`+`alembic.ini`+`frontend/dist` beside exe** | One layout contract; `app_base_dir()/alembic` holds for both tools | **Chosen** |
| PyInstaller `--add-data` | PyInstaller 6 onedir puts data in `_internal/`, NOT beside exe → breaks `migrations_dir()` | Rejected |

### ADR-4: CI `windows-latest` over Manual Build
| Option | Tradeoff | Decision |
|---|---|---|
| **Actions `windows-latest` job (MSVC preinstalled), artifact uploaded** | §6.6 acceptance verifiable in F1 without a Windows machine | **Chosen** |
| Manual Windows PC build | Unverifiable here; blocks the checklist | Rejected |

### ADR-5: Python 3.13.x Pin
| Option | Tradeoff | Decision |
|---|---|---|
| **3.13.x in scripts, CI, docs** | Venv is 3.13.7; all pins installed; cp313 wheels verified in CI | **Chosen** |
| 3.12 | Plan legacy; env drift | Rejected |

### ADR-6: Shutdown — POSIX Signals + WAL Tolerance
| Option | Tradeoff | Decision |
|---|---|---|
| **SIGINT/SIGTERM → exit(0); SQLite WAL absorbs Windows hard kills** | Windows never delivers signals to killed procs; WAL recovers on next connect; smoke: kill → relaunch → health | **Chosen** |
| Shutdown endpoint | New API surface; Fase 2+ | Deferred |

### ADR-7: Two-Marker `is_frozen()`
| Option | Tradeoff | Decision |
|---|---|---|
| **`sys.frozen` OR `"__compiled__" in globals()`** | Documented Nuitka marker; string check lint-safe; testable via `patch.object` | **Chosen** |
| `sys.frozen` only | Nuitka may skip it → frozen layout resolves dev paths | Rejected |

## Data Flow

Boot (dev `python entry.py`; frozen `telarycolor-server.exe`) — order per portable-startup "Entry Boot Chain":
```
entry.main()
 ├─1 apply_migrations()                 # in-process, NO subprocess
 │    Config(alembic.ini)
 │    ├─ script_location  = abs migrations_dir()     # <exe>/alembic | backend/alembic
 │    ├─ prepend_sys_path = abs mig_dir.parent        # CWD-independent
 │    └─ DATABASE_URL=sqlite:///<db_path()> → env.py → engine → upgrade head
 ├─2 find_free_port(8000)               # 127.0.0.1 only
 ├─3 write .port + "PORT:<port>"
 └─4 uvicorn.run(app, 127.0.0.1, port)  # from app.main import app → routers, _UploadsRoute, settings
```
URL consistency: `env.py` prefers `DATABASE_URL` env, falling back to `settings.database_url`; both derive from the same `db_path()` → Alembic engine and runtime engine (`session.py`) touch the identical file.

Cycle: dev/frozen boot → 1 → 2 → 3 → 4. CI: `push → checkout → setup-python 3.13 → pip install requirements.txt + requirements-build.txt → compile.py (Nuitka, MSVC) → stage_dist.py → smoke_binary.py (seed sandbox → launch → .port → /health<3s → login → upload 2xx → GET / 200 → size<200MB → hard-kill → relaunch → health 200) → upload-artifact exe + dist`.

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/entry.py` | Modify | In-process Alembic; explicit `app` import; keep boot order/`.port`/`PORT:`/signals |
| `backend/app/core/paths.py` | Modify | `is_frozen()` two-marker |
| `backend/app/core/config.py` | Modify | Security warning uses `is_frozen()` (covers Nuitka builds) |
| `backend/tests/test_entry.py` | Modify | RED: in-process migration + explicit app tests |
| `backend/tests/test_paths.py` | Modify | RED: `__compiled__` cases |
| `backend/requirements-build.txt` | Create | `nuitka>=2.6`, `pyinstaller>=6.11` (build-only) |
| `uitka-build/compile.py` | Create | Nuitka `--standalone`: `--include-package=app`, `--include-module=bcrypt._bcrypt`, `--include-package=pydantic_core`, `--include-package=python_multipart`, `--include-module=sqlalchemy.dialects.sqlite`, `--nofollow-import-to=pytest,httpx,tkinter,unittest,setuptools,distutils,_distutils_hack`, `--strip`, `--output-filename=telarycolor-server`, `--windows-console-mode=disable` (win32) |
| `uitka-build/compile_pyinstaller.py` | Create | `--onedir`; `--collect-all app`; hidden-imports `app`, `pydantic_core`, `python_multipart`, `bcrypt`, `sqlalchemy.dialects.sqlite` |
| `uitka-build/stage_dist.py` | Create | Assemble dist: binary + `alembic/` + `alembic.ini` + `frontend/dist` beside exe |
| `uitka-build/smoke_binary.py` | Create | Cross-platform smoke core (Linux + CI) with size/time gates |
| `uitka-build/test_binary.sh` | Create | Bash wrapper → `smoke_binary.py` (spec artifact) |
| `.github/workflows/build-backend-windows.yml` | Create | `windows-latest`; setup-python 3.13; install both req files; compile → stage → smoke; upload-artifact; `permissions: contents: read` |
| `MIGRATION_FASES.md` + docs | Modify | Nuitka naming; 3.13.x; `app.db` naming |

## Interfaces / Contracts

```python
def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False)) or "__compiled__" in globals()
```

```python
cfg = Config(str(ini_file))                               # ini beside migrations dir
cfg.set_main_option("script_location", str(mig_dir))      # absolute
cfg.set_main_option("prepend_sys_path", str(mig_dir.parent))  # absolute, CWD-independent
os.environ["DATABASE_URL"] = f"sqlite:///{db_path()}"
try:
    command.upgrade(cfg, "head")          # idempotent — no-op at head
except Exception:
    print("FATAL: alembic migration failed", file=sys.stderr); sys.exit(1)
```
Boot ABORTS on failure; `alembic/`+`alembic.ini` absent → skip (API-only). `__main__` import order freezes statically.

**Smoke contract**: sandbox `TELARYCOLOR_DATA_DIR`; pre-seed via `python -m alembic upgrade head` + `python -m app.seed` (upload route `POST /samples/upload` requires JWT — `Depends(get_current_user)`); launch → read `.port` → `/health` 200 < 3 s → login (OAuth2 form) → multipart upload (route returns **201**; spec's "200" = success intent → assert 2xx) → `GET /` 200 (SPA staged) → staged size < 200 MB → hard-kill (SIGKILL / `taskkill /F`) → relaunch → health 200 (WAL recovery + idempotent re-migration).

## Testing Strategy (RED-first, strict TDD)

| Layer | RED test → assertion |
|---|---|
| Unit | `test_paths::test_is_frozen_true_when_nuitka_compiled` — `patch.object(paths,"__compiled__",True,create=True)` → True |
| Unit | `test_paths::test_app_base_dir_frozen_nuitka_only` — `__compiled__`+`sys.executable`, no `sys.frozen` → exe dir + `%APPDATA%` data |
| Unit | `test_entry::test_apply_migrations_upgrades_clean_db` — 11 tables + `alembic_version` @ head, in-process |
| Unit | `test_entry::test_apply_migrations_idempotent` — second run → unchanged tables |
| Unit | `test_entry::test_apply_migrations_failure_aborts_boot` — broken versions dir → `SystemExit` code 1 |
| Unit | `test_entry::test_apply_migrations_absolute_paths` — captured Config: absolute `script_location`/`prepend_sys_path`; `DATABASE_URL == sqlite:///{db_path()}` |
| Unit | `test_entry::test_apply_migrations_no_subprocess` — `subprocess.run` monkeypatched to raise; migration succeeds |
| Unit | `test_entry::test_uvicorn_receives_app_object` — mock run; arg is `app.main.app` instance, not string |
| E2E | Linux `test_binary.sh`; CI `smoke_binary.py` — gates + kill/relaunch |

Commands: `backend/.venv/bin/python -m pytest` (full suite; existing subprocess `test_migration.py` stays valid in dev); `bash uitka-build/test_binary.sh`; CI workflow on `windows-latest`.

## Threat Matrix

| Boundary | Applicability | Design response | RED test |
|---|---|---|---|
| Shell/subprocess | **Applicable** — runtime subprocess removed; build scripts invoke freezers | List-arg `subprocess.run(shell=False)` only in build scripts; binary runs zero shell | `test_apply_migrations_no_subprocess` |
| Process integration | **Applicable** — signals; kill cycles | POSIX `exit(0)`; Windows hard-kill tolerated (WAL); smoke kill → relaunch → health | smoke kill/relaunch (Linux + CI) |
| Git/commit/push/PR | N/A — workflow triggers on push, no git mutation; `contents: read` only | — | — |
| Executable-file classification | N/A — staging copies known paths | — | — |
| Documentation-like paths | N/A — `.py`/`.sh` run via explicit interpreters | — | — |

## Migration / Rollout

No schema/data change — in-process and subprocess migrations produce identical DB state (proved by existing `test_migration.py` + new entry tests). Dev `python -m uvicorn app.main:app` unchanged. Rollback: revert `entry.py`/`paths.py`/`config.py`; delete `uitka-build/`, workflow, `requirements-build.txt`; new tests retained (they validate both paths).

## Open Questions

- [ ] Smoke upload asserts 2xx (route is 201; spec reads "200") — confirm wording at verify.
- [ ] `--windows-console-mode=disable`: stdout must still flow through Electron's pipe; `.port` is the authoritative contract — validated by CI smoke.
- [ ] Exact build-tool pins set at apply to the CI-verified versions; floors above.