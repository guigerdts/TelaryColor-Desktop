# Exploration: fase1-empaquetado-backend

**Change:** fase1-empaquetado-backend
**Artifact Store:** openspec
**Date:** 2026-09-05
**Trigger:** "seguimos fase 1" — MIGRATION_FASES.md §6 (Empaquetado del backend), with MIGRATIONPC.md as decision context.

---

## ⚠️ Terminology discrepancy (mandatory read)

MIGRATION_FASES.md writes **"uitka"** / **"uitable"** throughout (tasks 1.1–1.6, §4.1, §4.2, §5.3 comments, §10.1 workflow) and prescribes `python -m uitka` and `pip install uitable`. **The real tool is Nuitka** — the CLI is `python -m nuitka`, the package is `nuitka` on PyPI. Every command in the plan's §6 snippets is invalid as written and must be corrected during apply. The plan also says `pip install uitable pyinstaller` (§4.2) — must be `pip install nuitka pyinstaller`.

Secondary divergence: the master plan's decision table (§1) chose **uitka over PyInstaller**, while MIGRATIONPC.md §2/§7 (decision matrix) recommends **PyInstaller (Backend A) with the browser shell as the MVP**. The user's directive for this change — "seguimos fase 1" referencing MIGRATION_FASES.md, and the change name "fase1-empaquetado-backend (uitka, con fallback PyInstaller)" — resolves the conflict: **Nuitka is primary, PyInstaller is the documented fallback** (MIGRATION_FASES §6.2). The proposal phase should confirm this with the user.

---

## Current State

Fase 0 (portable startup) is done and archived (`openspec/changes/archive/2026-09-04-fase0-arranque-portable-desktop/`). The backend is packaging-ready at the *path/port/boot* level, but **not** yet at the *freezer* level. Two blocking gaps and several hardening gaps were found.

### 1. Entry point readiness — mostly ready, ONE BLOCKING GAP

`backend/entry.py` (86 lines) implements the boot chain:

1. `apply_migrations()` — runs `subprocess.run([sys.executable, "-m", "alembic", "-c", ini, "upgrade", "head"])`
2. `find_free_port(8000)` → writes `.port` file + prints `PORT:<port>`
3. `uvicorn.run("app.main:app", host="127.0.0.1", ...)` with SIGINT/SIGTERM handlers

**BLOCKER:** `apply_migrations()` uses `sys.executable` as a Python interpreter. In a frozen bundle `sys.executable` **is the exe itself** — `exe -m alembic` cannot run. This is fatal under both Nuitka and PyInstaller. The migration step must be rewritten to use Alembic's in-process API (`alembic.config.Config` + `alembic.command.upgrade`), which works because `alembic/env.py` already imports `app.*` modules directly and resolves the URL from `DATABASE_URL` (env var) → `settings.database_url` (portable).

**BLOCKER (packaging):** `uvicorn.run("app.main:app", ...)` is a *string* import — `entry.py` never imports `app.main` statically, so neither freezer follows it. Nuitka needs `--include-package=app`; PyInstaller needs `--collect-all app` / `--hidden-import app.main`, otherwise the binary boots but dies resolving the app. `main.py`'s module graph pulls in every router, `_UploadsRoute`, and the SPA route — all reachable from `app.main`.

### 2. Portable paths — ready, but frozen-detection and layout need hardening

`backend/app/core/paths.py` is implemented as planned:

| Helper | Dev | Frozen | Status |
|--------|-----|--------|--------|
| `is_frozen()` | `getattr(sys, "frozen", False)` | same | ⚠️ **Nuitka does not reliably set `sys.frozen`** — it sets `__compiled__`. Must check both. |
| `app_base_dir()` | `backend/` (parents[2]) | `Path(sys.executable).parent` (exe dir) | ⚠️ Onefile mode extracts to a temp dir; exe dir only works in **standalone/onedir** mode. |
| `app_data_dir()` | `backend/data/` | `%APPDATA%\TelaryColor\data\` | ✅ (env override `TELARYCOLOR_DATA_DIR` for tests) |
| `app_log_dir()` | `backend/logs/` | `%APPDATA%\TelaryColor\logs\` | ✅ |
| `db_path()` | `backend/data/app.db` | `%APPDATA%\TelaryColor\data\app.db` | ✅ (⚠️ plan documents `telarycolor.db`; code uses `app.db` — keep `app.db`, update docs) |
| `uploads_dir()` | `backend/data/uploads/` | `%APPDATA%\TelaryColor\data\uploads\` | ✅ used via `settings.upload_dir` (config.py L46) |
| `migrations_dir()` | `backend/alembic` | `app_base_dir()/alembic` | ⚠️ requires `alembic/` staged next to the exe → forces **standalone/onedir** |
| `static_dir()` | repo-root `frontend/dist` | `app_base_dir()/frontend/dist` | ⚠️ requires `frontend/dist` staged next to exe (Fase 2 concern) |

`app/core/config.py` uses pydantic-settings with `env_file=app_base_dir()/".env"` — in frozen mode that resolves to the exe dir, which is correct (no shipping `.env` needed; env vars override). It already warns when a frozen build runs with dev `secret_key`/`seed_admin_password`.

**Frozen-layout conclusion:** the code's frozen paths assume files live **beside the exe**. This only works with **standalone (Nuitka) / onedir (PyInstaller)** — *not* onefile. `--onefile` would silently break `alembic/`, `alembic.ini`, and `frontend/dist` resolution. The plan's own §6.4 recommendation (`--standalone`, not `--onefile`) aligns: **use standalone/onedir + a staging script that assembles the dist folder** (exe + `alembic/` + `alembic.ini` + `frontend/dist`).

### 3. Alembic layout — ships fine, in-process call must be explicit

- `backend/alembic/env.py` registers all 7 module model packages on `Base.metadata`, imports `app.core.config` + `app.db.base`. All `app.*` imports must be present in the bundle (covered by `--include-package=app` / `--collect-all app`).
- `backend/alembic.ini` has `script_location = alembic` (relative!) and `prepend_sys_path = .` (CWD-relative). The in-process `Config` must override `script_location` with the absolute staged path and set `prepend_sys_path` to the exe dir — CWD is wherever Electron launches from, so relative resolution is unsafe in frozen mode.
- `alembic/versions/` = 0001–0006, pure SQLAlchemy ops, no external data — tiny (single-digit KB), trivially shippable.
- Current tests (`test_migration.py`) exercise alembic via the **subprocess** path (`sys.executable -m alembic`). They pass in dev and stay valid; the *entry.py* path needs its own in-process test (TDD hook).

### 4. Dependencies — small, well-behaved; extension modules must be handled explicitly

`backend/requirements.txt` (16 lines): `fastapi`, `uvicorn`, `python-multipart`, `sqlalchemy`, `alembic`, `bcrypt`, `PyJWT`, `pydantic-settings`, `pytest`, `httpx`, `pyyaml`. Import surface across `app/` confirmed clean (single grep pass, no dynamic/`__import__` usage beyond the two noted below).

| Package | Nature | Freezer handling |
|---------|--------|------------------|
| `fastapi` / `starlette` | pure Python | include (Nuitka follows; PyInstaller hook exists) |
| `uvicorn` | pure Python (+ `click`, `h11`) | include (base install, no `[standard]` extras → no uvloop/httptools risk) |
| `sqlalchemy` 2.0.52 | Python + optional `sqlalchemy.cyextension` | include dialect `sqlalchemy.dialects.sqlite` explicitly; C ext optional (pure-Python fallback works) |
| `alembic` (+ `mako`, `markupsafe`) | Python + small C ext | include |
| `bcrypt` 5.0.0 | **C extension** (`bcrypt._bcrypt`) | Nuitka copies the `.pyd`; `--include-module=bcrypt._bcrypt` per plan §6.5; PyInstaller collects binary |
| `pydantic` / `pydantic_core` 2.46.4 | **Rust extension** | `--include-package=pydantic_core`; PyInstaller hook exists |
| `PyJWT` | pure Python, module name `jwt` | plan's `--include-package=jwt` is correct |
| `python-multipart` | pure Python | ⚠️ **lazily imported by Starlette** — do NOT rely on static analysis; explicit include in both scripts (samples router uses `UploadFile=File(...)`, `app/modules/samples/router.py` L206) |
| `pyyaml` | Python + optional C `_yaml` | fallback works without C ext; `settings.py` already guards ImportError |
| `pytest`, `httpx` | **test-only** | exclude from the production binary |

Safe exclusions: `tkinter`, `unittest`, `pytest`, `httpx`, `setuptools`, `distutils`/`_distutils_hack` (plan §6.1 already names tkinter/unittest — extend with the test-only pair). `hex_dataset.py` is 31 KB pure Python, `seed.py` 1.6 KB — both ship.

### 5. Frontend static — exists, Fase 2 territory but affects Fase 1 verification

`frontend/dist/` **exists** (index.html, assets/, icons/, manifest.webmanifest). `main.py` mounts it via `_SPARoute` only when `static_dir()` is a directory — safe skip otherwise. For the Fase 1 `test_binary.sh` SPA check (`GET /` → 200) to pass, `frontend/dist` must be staged next to the binary *or* that check is deferred to Fase 2. Note `static_dir()` frozen = exe-dir/frontend/dist, but MIGRATION_FASES §7.2 plans resources/frontend — Fase 2 must reconcile (out of scope here).

### 6. Tooling reality — both tools missing; Python 3.13.7 on Linux

| Check | Result |
|-------|--------|
| Python version (venv) | **3.13.7** (plan/CI assume 3.12 — must be aligned across build scripts) |
| `nuitka` in venv | ❌ not installed (`No module named nuitka`) |
| `pyinstaller` in venv | ❌ not installed |
| OS of this machine | **Linux** → Nuitka AND PyInstaller cannot cross-compile to Windows. Local Linux builds validate the toolchain + boot chain; the **Windows artifact requires a Windows machine or CI** (GitHub Actions `windows-latest`). |
| CMake/MinGW (Nuitka C compiler on Windows) | N/A here — Nuitka on Windows needs MSVC (Visual Studio Build Tools) or MinGW64 on the build host; CI VMs have MSVC preinstalled. |

**Platform strategy:** use the Linux host to (1) install both tools, (2) produce a **Linux standalone/onedir smoke build**, and (3) run the full boot-chain verification (migrations → port → `.port` → health) against it. That validates every packaging-relevant behavior except the Windows packaging itself. Then produce the Windows build either manually on a Windows PC (MIGRATIONPC camino a — "para validar") or via a minimal CI build job. MIGRATION_FASES places CI in Fase 5, but **without CI or a Windows machine the §6.6 checklist ("Binario funciona sin Python instalado en la PC") is unverifiable in Fase 1** — the proposal should decide: add a build-only CI job now, or accept manual Windows build as the Fase 1 validation path.

### 7. `__main__` / uvicorn string references

- `backend/entry.py` L85: `if __name__ == "__main__": main()` — entry script, correct target for both freezers.
- `backend/app/main.py` L126: own `__main__` block (dev convenience) — harmless.
- `uvicorn.run("app.main:app", ...)` string import — see BLOCKER above (needs explicit package inclusion).

### 8. Repo config

No `opencode.json` / `.opencode/` — nothing to inherit for build agents. Git status clean.

---

## Affected Areas

- `backend/entry.py` — **rewrite `apply_migrations()` to in-process Alembic API** (blocker); keep boot order and `PORT:`/`.port` contract; add `TELARYCOLOR_DATA_DIR`-respecting behavior (already via paths).
- `backend/app/core/paths.py` — harden `is_frozen()` for Nuitka (`sys.frozen` OR `__compiled__`); document onefile-vs-standalone resource-dir constraint.
- `backend/tests/test_entry.py` — extend (or new `test_entry_frozen.py`) to cover the in-process alembic migration path with a mocked/sandboxed DB (STRICT TDD: test-first).
- `uitka-build/compile.py` (new) — Nuitka command corrected (`python -m nuitka`, `--standalone`, `--include-package=app`, `--include-module=bcrypt._bcrypt`, `--include-package=pydantic_core`, `--include-package=python_multipart`; SQLite dialect is covered by `--include-package=sqlalchemy`; add `--nofollow-import-to` exclusions; `--output-filename=telarycolor-server`; `--windows-console-mode=disable` — accept that `PORT:` stdout is not visible and the `.port` file remains the Electron contract).
- `uitka-build/compile_pyinstaller.py` (new, fallback) — mirror flags for PyInstaller (`--onedir`, `--collect-all app`, `--add-data alembic;alembic`, `--add-data alembic.ini;.`, hidden-imports for `python_multipart`, `app.main`).
- `uitka-build/test_binary.sh` (new) — Linux smoke: health + `.port` + migration + SPA (SPA check only when `frontend/dist` staged).
- `uitka-build/stage_dist.sh` or equivalent (new, or fold into compile scripts) — assemble dist layout: `telarycolor-server(.exe)` + `alembic/` + `alembic.ini` + `frontend/dist`.
- `backend/requirements.txt` — add `nuitka` + `pyinstaller` as a build-only section/suffix (or a `requirements-build.txt`).
- `.github/workflows/` (decision pending §6) — optional build-only Windows job; full release workflow stays in Fase 5.
- Docs: MIGRATION_FASES.md "uitka/uitable" terminology + `telarycolor.db` vs `app.db` naming.

---

## Approaches

1. **Nuitka standalone primary + PyInstaller fallback, in-process alembic, Linux smoke build now, Windows artifact via CI `windows-latest` build job**
   - Pros: honors the master plan (uitka) and the user's directive; the §6.6 checklist becomes verifiable end-to-end (Linux smoke locally + Windows binary in CI without touching a Windows machine); fallback script is already planned (§6.2); strict-TDD-friendly (test_entry extension); smallest deviation from approved plan.
   - Cons: Nuitka adds a C-toolchain dependency on the Windows build host (MSVC — free on CI); first Nuitka run is slow (compiles to C); plan terminology churn must be corrected in docs; requires `pip install nuitka pyinstaller` explicitly (currently missing from env).
   - Effort: Medium (≈2–3 days including the blocker rewrite + CI job).

2. **PyInstaller-only (MIGRATIONPC recommended MVP), defer Nuitka**
   - Pros: MIGRATIONPC's matriz explicitly recommends PyInstaller; PyInstaller is more forgiving with dynamic imports (hooks for fastapi/starlette/alembic); well-trodden path, fewer toolchain surprises on Windows.
   - Cons: contradicts the master plan §4.1 decision and the user's phase directive; bigger binary (~200–400 MB vs 50–150 MB), slower first launch (onefile) — the exact criteria §4.1 chose uitable for. Would need a second change later to switch to Nuitka.
   - Effort: Low-Medium (≈1–2 days) — but delivers a different artifact than the plan's §6 spec.

3. **Toolchain-agnostic first: ship the blocker fixes + staging layout + Linux smoke harness, build tool decided by proposal**
   - Pros: the entry.py/alembic/paths work is identical under both freezers, so the phase's core value lands regardless of which tool wins; de-risks the open question cheaply.
   - Cons: leaves the "which tool" decision to the proposal phase (user already said uitka); slightly slower to a shippable Windows binary.
   - Effort: Medium (the fixes are the same size either way).

## Recommendation

**Approach 1, scoped as:** fix the blockers (in-process Alembic in `entry.py`, frozen-detection hardening, standalone/onedir staging layout), write the Nuitka compile script with **corrected** commands plus the PyInstaller fallback script, add the test-first `test_entry` coverage, do a **Linux standalone smoke build** locally to validate the boot chain, and add one **CI build-only job (`windows-latest`)** so the actual §6.6 acceptance (Windows binary, no Python installed, < 200 MB, starts < 3 s) is verifiable. Keep `uitka-build/` as the directory name (plan's name; contents are the corrected Nuitka tooling). Surface the "uitka=real Nuitka" terminology and the MIGRATIONPC-vs-MIGRATION_FASES tool divergence in the proposal so the user confirms Nuitka-primary once.

## Risks

- **CRITICAL:** entry.py's `sys.executable -m alembic` subprocess cannot work frozen — the current test suite doesn't catch it (tests run in dev mode). Must be rewritten and covered by a new test *before* any Windows build attempt.
- **HIGH:** `--onefile` silently breaks `alembic/`, `alembic.ini`, and `frontend/dist` resolution (exe-dir assumption). Mitigate with standalone/onedir + staging script; verify in `test_binary.sh`.
- **MEDIUM:** Nuitka `sys.frozen` detection — `is_frozen()` must also check `__compiled__`, or data dirs silently resolve to dev layout in the Windows build.
- **MEDIUM:** Windows signal semantics — `Electron.kill('SIGTERM')` = hard terminate (no graceful shutdown); §6.6 "maneja SIGINT/SIGTERM gracefully" is only half-satisfiable on Windows (SIGINT/CTRL_C_EVENT works). SQLite WAL tolerates kills; document, and consider a shutdown endpoint in a later phase. Not Fase 1-blocking.
- **MEDIUM:** python-multipart lazily imported by Starlette — if missed by the freezer, uploads fail at runtime with no build-time error. Explicit include in both scripts + a smoke POST in `test_binary.sh`.
- **MEDIUM:** Python version mismatch (local 3.13.7 vs plan/CI 3.12) — pin one version everywhere; dependency wheels (bcrypt 5.x, pydantic_core, SQLAlchemy 2.0.52) have cp313 Windows wheels by now, but verify in CI.
- **LOW:** `static_dir()` frozen layout (`exe/frontend/dist`) vs MIGRATION_FASES §7.2 (`resources/frontend`) conflict — Fase 2 reconciliation; Fase 1 SPA check optional.
- **LOW:** test-only deps (`pytest`, `httpx`) leaking into the bundle → size and AV surface; use `--nofollow-import-to`.
- **LOW:** docs terminology (uitka/uitable) and `telarycolor.db` vs `app.db` — cosmetic, fix in apply/docs.

## Ready for Proposal

**Yes** — exploration is complete, blockers are identified with concrete fixes, and the tool decision (Nuitka-primary, PyInstaller-fallback) matches the user's directive. The proposal should (a) confirm Nuitka-primary given MIGRATIONPC's PyInstaller recommendation, (b) decide CI-build-job-now vs manual-Windows-build for Fase 1 validation, and (c) bless the `uitka` → Nuitka terminology correction.