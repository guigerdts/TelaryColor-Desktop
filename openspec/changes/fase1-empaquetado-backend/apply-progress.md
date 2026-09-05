# Apply Progress — PR 1 + PR 2 + PR 3 (Phase 1: Foundation + Phase 2: Core — Build Tooling + Phase 3: Windows CI + Docs)

**Store**: openspec · **Mode**: Strict TDD · **Batches**: 1 of 3 (PR 1) + 2 of 3 (PR 2) + 3 of 3 (PR 3, tasks 3.1–3.2) · **Status**: success

## Completed — Phase 1 (PR 1)

- [x] 1.1 RED: `tests/test_paths.py` — `test_is_frozen_true_when_nuitka_compiled`, `test_app_base_dir_frozen_nuitka_only`
- [x] 1.2 GREEN: `app/core/paths.py` — `is_frozen()` → `bool(getattr(sys,"frozen",False)) or "__compiled__" in globals()`
- [x] 1.3 `app/core/config.py` — SECURITY warning branch now guards on `is_frozen()`; removed now-unused `import sys`; import of `is_frozen` added
- [x] 1.4 RED: `tests/test_entry.py` — 6 new tests (file existed with 1 boot test; kept + expanded)
- [x] 1.5 GREEN: `entry.py` — in-process Alembic (`alembic.config.Config` + `alembic.command.upgrade(cfg,"head")`), absolute `script_location`/`prepend_sys_path`, `os.environ["DATABASE_URL"] = sqlite:///{db_path()}`, FATAL+exit(1) on failure, `from app.main import app` passed as object to `uvicorn.run`, boot order/.port/PORT:/signals preserved, subprocess import removed
- [x] 1.6 GREEN: targeted 25/25 green; full suite 242 passed + 1 pre-existing failure (proven pre-existing by stash-test on pristine tree); dev boot smoke green

## Completed — Phase 2 (PR 2)

- [x] 2.1 `backend/requirements-build.txt` — `nuitka>=2.6`, `pyinstaller>=6.11` (build-only; runtime requirements.txt untouched)
- [x] 2.2 `uitka-build/compile.py` — Nuitka `--standalone`, exe `telarycolor-server`, include-package/module set, nofollow list, `--windows-console-mode=disable` (win32 only), subprocess always `shell=False`. DEVIATIONS (Nuitka 4.x reality): `--strip` removed (deleted in 4.x — stripping is now the default); all options use `--option=value` form (4.x requires it; `--output-dir DIR` separate-arg form is rejected). Added generic `--nuitka-arg` passthrough (repeatable extra flags for constrained machines, e.g. `--low-memory`).
- [x] 2.3 `uitka-build/compile_pyinstaller.py` — `--noconfirm --onedir --name telarycolor-server --distpath backend/dist --collect-all app` + 5 `--hidden-import` (app, pydantic_core, python_multipart, bcrypt, sqlalchemy.dialects.sqlite), cwd=backend
- [x] 2.4 `uitka-build/stage_dist.py` — freezer-aware auto-detect (Nuitka `<root>/telarycolor-server.dist/` vs PyInstaller `<root>/dist/telarycolor-server/`) across `[REPO_ROOT, BACKEND_DIR]`; `--freezer {auto,nuitka,pyinstaller}` + `--exe` override; copies `alembic/`, `alembic.ini`, `frontend/dist` beside exe (shutil only). Unit-verified: both layouts, `--freezer pyinstaller`, `--exe` override, staged tree = exe + 3 resources.
- [x] 2.5 RED→GREEN: `backend/app/modules/health/router.py` — APIRouter `@router.get("/health")` → `{"status": "ok"}`, no auth. `main.py`: `include_router(health_router)` placed BEFORE `_mount_spa(app)` (the `_SPARoute` catch-all otherwise shadows `/health` with index.html — confirmed real RED failure mode). RED confirmed (SPA shadow), then `tests/test_health.py` 2 passed (content-type JSON + no-auth triangulation).
- [x] 2.6 `uitka-build/smoke_binary.py` — seeds sandbox (TELARYCOLOR_DATA_DIR, alembic head + `python -m app.seed`), launches `--exe`, reads `.port`, GET /health <3s gate, OAuth2 login, multipart upload 2xx, SPA GET / 200, staged size <200MiB, SIGKILL/taskkill hard-kill, relaunch health 200. `launch_binary()` PINs `DATABASE_URL` to the sandbox (see Issues/Discoveries).
- [x] 2.7 `uitka-build/test_binary.sh` — `set -euo pipefail`, venv python resolution (backend/.venv/bin/python → Scripts/python.exe → python3), `exec python uitka-build/smoke_binary.py "$@"`. chmod +x.
- [x] 2.8 Linux standalone build + smoke — PARTIAL, honestly reported: dev-mode wrapper smoke E2E GREEN (health 200 in 1.39s, login 200, upload 201, SPA 200, size 0.4MiB < 200MiB, SIGKILL exit -9, relaunch health 200). Real Nuitka 4.2 build verified through genuine gcc C-compilation: Python-level compile + optimization, C codegen, data composer, and Scons/gcc all ran; the final link could NOT complete on this host (3-core, ~2G RAM, 99%-disk sandbox, 75-min command cap, no resumable C cache — retry = full restart). Full frozen link + smoke deferred to windows-latest CI (Phase 3).

## Completed — Phase 3 (PR 3, tasks 3.1–3.2)

- [x] 3.1 Created `.github/workflows/build-backend-windows.yml` (100 lines, copied byte-identical from /tmp/opencode/pr3-draft/build-backend-windows.yml). Structure: `on.push` branches [main] with paths (backend/**, uitka-build/**, frontend/dist/**, the workflow itself) + `workflow_dispatch`; `permissions: contents: read` (CI-only, no secrets, never publishes a release); windows-latest runner; actions/checkout@v4; setup-python@v5 `python-version: '3.13'` with pip cache keyed on backend/requirements.txt + requirements-build.txt; install runtime deps; install build-only deps (nuitka, pyinstaller); **cp313 dependency wheel assertion step** (shell: bash — git-bash heredoc because pwsh has no `<<'EOF'`): asserts sys.version_info == (3,13) and that pydantic-core/bcrypt/sqlalchemy resolve compiled cp313 wheels (WHEEL Tag: cp313 or .pyd/.so/.dll present), raises SystemExit if any dep lacks cp313; `python uitka-build/compile.py --output-dir build` (Nuitka standalone, MSVC preinstalled on windows-latest); `python uitka-build/stage_dist.py --exe build/telarycolor-server.dist/telarycolor-server.exe`; `python uitka-build/smoke_binary.py --exe <same> --staged-dir <same>`; upload-artifact@v4 (name telarycolor-server-windows, path build/telarycolor-server.dist/, `if-no-files-found: error`, retention 14 days). PyInstaller fallback documented (comment) as re-running with `--freezer pyinstaller`. The workflow's own gates: cp313 assertion step fails if a compiled dep lacks cp313; `if-no-files-found: error` fails the job if the build produced no exe. RED natural for CI is inherent in those two gates — a Windows build CANNOT be executed on this Linux sandbox; the windows-latest run is scheduled for the remote runner.
- [x] 3.2 Applied all 23 doc-fix directives from /tmp/opencode/pr3-draft/docs-fixes.md EXACTLY (1-line remove+add pairs in the files' existing Spanish): F1 TOC entry + F2 §6 heading (uitka→Nuitka); F3 §6.1 title "Setup de Nuitka"; F4 compile.py snippet docstring; F5 `'-m', 'uitka'`→`'-m', 'nuitka'`; F6 `'--onefile',  # or --onedir`→`'--standalone',  # onefile SHALL NOT be used (exe-relative resources)`; F7 "Si Nuitka falla"; F8 optimization table header "Comando Nuitka"; F9 `--strip` row → "(default desde Nuitka 4.x; `--strip` fue eliminado) | ya incluido"; F10 onefile row → "`--onefile` (PROHIBIDO) | rompe recursos relativos al exe"; F11 "fallar con Nuitka"; F12 Python 3.12→3.13 support row; F13 data-layer box `backend/data/app.db`; F14 db_path() snippet `app_data_dir() / 'app.db'`; F15 test snippet `p.name == 'app.db'`; F16 user-facing data location `%APPDATA%\TelaryColor\data\app.db`; F17 SQLite URI `'sqlite:///app.db'`; F18 §10.1 release.yml python-version '3.13'; F19 `pip install uitable`→`pip install -r requirements-build.txt`; F20 `python -m uitable --standalone --onefile`→`python -m nuitka --standalone --output-dir=dist entry.py`; F21 §10.2 pr-check.yml python-version '3.13'; F22 `uitka>=1.8`→`nuitka>=2.6`; F23 MIGRATIONPC.md Option b → Nuitka (PyInstaller como fallback).

## TDD Cycle Evidence (PR 2)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 2.5 | tests/test_health.py | Unit/Integration | Written first; RED confirmed (`JSONDecodeError`/assert — SPA catch-all served index.html for /health on old code) | 2 passed | 2 cases: content-type application/json + no-auth required | None needed |
| 2.6 | (harness, not unit-tested) | E2E | N/A — harness itself | SMOKE PASS (see 2.8) | .port + PORT: + health 200 + upload 201 + SPA 200 + size + relaunch | launch_binary() DATABASE_URL pin |
| 2.8 | harness E2E | E2E | N/A | dev-mode SMOKE PASS; frozen link host-limited | 2 freezer paths (Nuitka flag set + PyInstaller args) | compile.py `=`-form flags, `--strip` removal |

## TDD Cycle Evidence (PR 3)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 3.1 | (no unit test — CI workflow) | Integration | RED natural: cp313 assertion step + `if-no-files-found: error` fail the job if cp313 wheels or the exe are missing | YAML parses: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-backend-windows.yml'))"` → OK; file byte-identical to draft (diff printed IDENTICAL) | flags match real scripts verbatim (compile.py --output-dir build; stage_dist.py --exe build/telarycolor-server.dist/telarycolor-server.exe; smoke_binary.py same exe+staged-dir) | None |
| 3.2 | (docs — content verification) | Docs | N/A — no test runner for docs | 23/23 directives applied; old lines gone (0 matches for modified strings), new lines present (confirmed via rg) | 1:1 line-replacement pairs vs git diff (22/22 MIGRATION_FASES.md, +2/−1 MIGRATIONPC.md) | None |

## Work Unit Evidence (PR 3)

| Evidence | Value |
|---|---|
| Focused test command + result | `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-backend-windows.yml'))"` → `YAML OK via python3`; `diff /tmp/opencode/pr3-draft/build-backend-windows.yml .github/workflows/build-backend-windows.yml` → IDENTICAL (100 lines); `rg` verification: all 23 new doc lines present, all 23 old lines removed |
| Runtime harness command/scenario | Windows CI run CANNOT execute on this Linux sandbox — the `windows-latest` job (build → stage → smoke → artifact) is scheduled for the remote GitHub runner. The workflow's own RED gates (cp313 assertion, `if-no-files-found: error`) are the runtime-boundary checks and cannot run here. Runtime boundary: N/A on sandbox by design. |
| Rollback boundary | Delete `.github/workflows/build-backend-windows.yml`; `git checkout -- MIGRATION_FASES.md MIGRATIONPC.md` (or revert the 23 diff pairs). No PR-1/PR-2 file touched by this batch. |

## PR 3 Exact Diff Numbers

- Workflow (new file): +100
- MIGRATION_FASES.md: +22 / −22 = 44 changed
- MIGRATIONPC.md: +2 / −1 = 3 changed (F23's shared first line is diff context — draft's "5 lines" count was approximate; actual git diff is 3)
- TOTAL: 147 changed lines; net **+101** (matches expected net exactly)
- Draft estimate was ≈149/49 — actual 147/47 because F23's unchanged first line is context in git diff.

## Deviations from Design

- PR 3: none — workflow and all 23 doc fixes applied EXACTLY as specified in /tmp/opencode/pr3-draft (copy verbatim, no re-derivation). Residual `uitka`/`uitable` references at MIGRATION_FASES.md lines 255 (`~150-250 MB (uitka)`), 287 (`pip install uitable pyinstaller`), 1636 (`empaquetado con uitable`), 2039 (`python -m uitable --standalone`) are NOT in the 23 directives — flagged for a later doc pass, intentionally NOT changed per "do not guess beyond the spec".
- (Carried from PR 1/2) `--strip` removed, `=`-form flags, `--nuitka-arg` passthrough, test_entry pre-existing failures, sandbox workaround — see PR 1/PR 2 sections above.

## Issues Found

- PR 3 residual uitka refs (MIGRATION_FASES.md 255/287/1636/2039) — outside the 23 directives; left as-is, flagged for later pass.
- (Carried) PRE-EXISTING `test_inventory.py::test_downgrade_drops_only_new_inventory_tables` alembic 0004 KeyError — out of scope for all 3 PRs. Tracked separately as https://github.com/guigerdts/TelaryColor-Desktop/issues/1 (OPEN, label bug).
- (Carried) PR 2 discoveries: `.env` DATABASE_URL CWD-relative pin in launch_binary(); Nuitka 4.x flag surface; sandbox Debian Python host-grafted sysconfig; host limits blocked full frozen link (deferred to windows-latest CI).

## Next

- Task 3.3 (verify all 3 slices integrate: backend tests green, Linux smoke green, YAML valid [done here], docs version-consistent) → then Phase 4 (4.1/4.2 cleanup). Verify phase can re-run targeted tests + full suite (monitor known pre-existing inventory downgrade) + dev boot smoke; definitive frozen verification is the windows-latest CI run.

**Rollback boundary**: PR 3 batch is `.github/workflows/build-backend-windows.yml` (delete) + MIGRATION_FASES.md/MIGRATIONPC.md (git checkout). PR-1/PR-2 files untouched by this batch.
**PR boundary**: PR 3 = this batch (tasks 3.1–3.2); tasks 3.3, 4.1, 4.2 NOT in this batch (3.3 is verify-phase input; 4.x cleanup).