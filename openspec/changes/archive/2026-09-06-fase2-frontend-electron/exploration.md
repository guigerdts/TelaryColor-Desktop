# Exploration — Fase 2: Frontend integration into Electron shell

**Scope:** Combine the Phase 1 packaged backend binary (`entry.dist/telarycolor-server.exe`)
with the frontend build and an Electron shell that spawns, manages, and shuts down the
backend, then serves the SPA in a native window.

**Store:** openspec (`openspec/changes/fase2-frontend-electron/`)

---

## Current State

### 1. Backend binary management

**Boot chain (`backend/entry.py`, frozen exe entry point):**

1. In-process Alembic upgrade (`alembic.command.upgrade(cfg, "head")`) — aborts with
   `FATAL` + `sys.exit(1)` on failure.
2. `find_free_port(8000)` — preferred 8000, else random free port
   (`backend/app/core/port.py`, TOCTOU race documented as acceptable).
3. `write_port_file(port)` — writes `.port` to **`app_data_dir()/.port`**.
4. Prints `PORT:<port>` on stdout (flush=True).
5. Registers `SIGINT`/`SIGTERM` handlers → `sys.exit(0)`.
6. `uvicorn.run(app_object, host="127.0.0.1", port=port)` — app OBJECT, never a string
   import (freezer static-trace requirement).

**Path resolution (`backend/app/core/paths.py`):**

- `is_frozen()` → `sys.frozen` (PyInstaller) or `__compiled__` (Nuitka).
- `app_base_dir()` → exe dir when frozen; `backend/` in dev.
- `app_data_dir()` → `%APPDATA%/TelaryColor/data` when frozen (env override
  `TELARYCOLOR_DATA_DIR`), `backend/data` in dev.
- `static_dir()` → `<exe-dir>/frontend/dist` when frozen; repo `frontend/dist` in dev.
- `migrations_dir()` → `<exe-dir>/alembic` when frozen (alembic.ini read from
  `migrations_dir().parent` = exe dir).

**Shutdown/cleanup today:**

- No `atexit`; cleanup is uvicorn's own drain. Signal handlers are installed in
  `entry.py` but uvicorn installs its own SIGINT/SIGTERM handlers too (belt and braces).
- **Windows reality (critical):** Node/Electron `child.kill('SIGTERM')` and
  `UtilityProcess.kill()` on Windows call **`TerminateProcess`** — a hard kill; signal
  names are ignored. POSIX-style signal delivery does not exist. `taskkill /PID <pid>`
  (without `/F`) is the closest "graceful" route: it posts `WM_CLOSE`; for a console
  process the console host fires `CTRL_CLOSE_EVENT`, which CPython maps to SIGTERM
  (entry.py handler CAN run) — but only inside the console-host grace window (~5 s) and
  only when the child actually has a console. With `windowsHide`/`CREATE_NO_WINDOW` this
  chain is unreliable.
- The CI smoke test's "graceful" second kill (`proc2.send_signal(signal.SIGTERM)` on
  Windows) is itself a `TerminateProcess` — i.e. **hard-kill tolerance is already the
  proven Windows path** (WAL recovery + idempotent re-migration → health 200).

**Smoke contract (`uitka-build/smoke_binary.py`):**

- Launches with `TELARYCOLOR_DATA_DIR` + absolute `DATABASE_URL` pinned.
- Waits for `.port` file (poll), then `GET /health` → 200 within a time gate.
- `hard_kill()` → `taskkill /F /T /PID` on Windows, `SIGKILL` on POSIX.
- Relaunch with the same sandbox proves WAL/rollback recovery + idempotent migration.

### 2. Frontend serving architecture

- `frontend/package.json` → `"build": "vite build"` → `frontend/dist/` (base `/`, so
  asset URLs are absolute `/assets/*.js`).
- `frontend/vite.config.js` — dev-only proxy `/api` + `/uploads` → `:8000`; production
  is **single-origin** (no CORS).
- `backend/app/main.py` mounts the built SPA via a custom `_SPARoute`:
  - Serves real files from `static_dir()` (FastAPI `static_dir()` helper), falls back to
    `index.html` for client-routed paths (React Router deep-link support).
  - Yields `Match.NONE` for `/api/*` and `/uploads/*` so REST + uploads always win.
  - Mounted only when the dist directory exists at app-creation time.
- The frontend API client uses **relative** `/api/v1/*` + `/uploads/*` paths
  (`frontend/src/api/client.js`), token in **localStorage**
  (`frontend/src/auth/store.js`), 401 → `window.location.assign('/login')`.
- No service worker. PWA manifest exists in `public/` (harmless in Electron).
- **Loaded from `http://127.0.0.1:{port}` the SPA works with ZERO frontend changes.**
  Loaded from `file://`, every relative API path, `/uploads` images, and localStorage
  would break. → localhost loading is the only viable option (confirms plan draft).

### 3. Port discovery mechanism

- `entry.py` writes `.port` **inside the data dir**: frozen →
  `%APPDATA%/TelaryColor/data/.port`; dev → `backend/data/.port`.
- Smoke test reads the `.port` file; it is the documented Fase 1 boot-chain contract
  (`test_entry.py` asserts both `.port` write and `PORT:` stdout line).
- The frontend does NOT read `.port` — it relies on same-origin relative URLs.
- Electron must compute the identical path: on Windows `app.getPath('appData')` ==
  `%APPDATA%` → `path.join(appData, 'TelaryColor', 'data', '.port')`.
- The plan draft's stdout regex (`/port (\d+)/`) does NOT match the implemented
  `PORT:<port>` format — the draft parsed stdout; the reliable contract is the `.port`
  file (poll), with `PORT:<port>` stdout as a secondary signal.

### 4. Packaging integration point (delivery context)

- CI (`build-backend-windows.yml`): Nuitka build → frontend build → `stage_dist.py`
  (copies `alembic/`, `alembic.ini`, `frontend/dist` beside the exe in `entry.dist/`) →
  smoke → upload artifact (whole `entry.dist/`).
- **Electron packaging must preserve that validated layout.** electron-builder
  `extraResources` should map the whole staged `entry.dist/` →
  `resources/backend/` so `app_base_dir()` (= exe dir = `resources/backend`) resolves
  alembic, alembic.ini and `frontend/dist` exactly as the smoke-tested bundle.
- The MIGRATION_FASES.md §8.1 draft mapped `frontend/dist` → `resources/frontend` and
  omitted `alembic.ini` — **both would break the frozen bundle at runtime** (SPA 404 +
  `static_dir()` mismatch; migrations fatal). Package the staged layout, do not rebuild.

---

## Affected Areas

- `electron/main.js` (new) — backend spawn/health-gate/window/shutdown, single-instance.
- `electron/preload.js` (new) — contextBridge surface (`contextIsolation: true`).
- `electron/package.json` (new) — electron + electron-builder config; `extraResources`
  from the staged `entry.dist/`.
- `backend/app/main.py` (+ new shutdown route) — graceful-stop endpoint.
- `.github/workflows/build-backend-windows.yml` — electron-builder packaging step.
- `MIGRATION_FASES.md` — Fase 2/3 final architecture updates.
- Unchanged/reused: `entry.py`, `paths.py`, `port.py`, SPA mount, `stage_dist.py`
  layout, smoke contract, all frontend code.

---

## Approaches

### A. Backend process lifecycle

1. **Shutdown endpoint + taskkill fallback** (recommended)
   - Add an unauthenticated `POST /api/v1/system/shutdown` bound to 127.0.0.1 that sets
     `server.should_exit = True` (registered before the SPA catch-all, like `/health`).
     Electron calls it, waits ≤ N s for `exit`, then `taskkill /F /T /PID` (proven
     CI pattern) as last resort.
   - Pros: deterministic graceful shutdown on Windows (works today, no signal games);
     testable with pytest + smoke; aligned with "graceful first, hard only last";
     WAL recovery remains the documented safety net.
   - Cons: one small backend delta (+ tests); endpoint is unauthenticated (acceptable:
     bound to loopback, same trust model as `/health`).
   - Effort: Low–Medium.

2. **Signal-only management** (draft plan's approach, fixed)
   - `child.kill('SIGTERM')` first, timeout, `taskkill /F /T` fallback; add
     `windowsHide: true`.
   - Pros: zero backend changes.
   - Cons: on Windows the "graceful" step is effectively a hard TerminateProcess
     (handlers never run) — the graceful path is a fiction; SQLite WAL takes the hit on
     every close. `taskkill` without `/F` is unreliable for console-less children.
   - Effort: Low.

3. **stdin/pipe shutdown contract (no HTTP surface)**
   - Backend thread reads stdin; Electron writes "shutdown\n" to stdin; then `taskkill
     /F` fallback.
   - Pros: no HTTP endpoint; works while backend 127.0.0.1-bound.
   - Cons: frozen exe + stdin handling = extra backend code + thread complexity; no
     smoke-visible contract; marginal benefit over the endpoint.
   - Effort: Medium.

### B. Frontend serving

1. **Load `http://127.0.0.1:{port}` in BrowserWindow** (recommended, no other viable
   option)
   - Pros: single-origin preserved, zero frontend changes, localStorage works,
     `/uploads` photos render, dev proxy untouched.
   - Cons: backend must be up before window loads (handled by health gate).
   - Effort: Low.

2. `file://` + custom protocol handler — rejected: breaks relative API paths,
   `/uploads`, and localStorage; requires frontend rewrite + protocol registration.
   - Effort: High.

### C. Port discovery

1. **Read `.port` file from the data dir (poll) + `GET /health` gate** (recommended)
   - Pros: exact Fase 1 contract (what the smoke test uses); no stdout parsing;
     health gate proves real readiness before the window loads (stronger than the
     draft's raw TCP connect).
   - Cons: path must mirror Python's `app_data_dir()` exactly — centralize the
     computation; dev-mode path differs (Linux dev = `backend/data`).
   - Effort: Low.

2. Parse `PORT:<port>` from stdout only — works, but file read is the documented
   contract and survives logging changes; stdout stays as a secondary signal.
   - Effort: Low.

---

## Recommendation

- **Backend lifecycle:** Approach A1 — shutdown endpoint (`server.should_exit`) as the
  graceful path, `taskkill /F /T` after timeout, WAL recovery documented as last resort.
  Before spawning, probe any existing `.port` + `/health` and **reuse a live backend**
  instead of starting a second one (prevents two processes racing on one SQLite DB).
  Spawn with `detached: false` + `windowsHide: true`; kill the child in
  `before-quit`/`will-quit`; `app.requestSingleInstanceLock()`.
- **Serving:** Approach B1 — BrowserWindow loads `http://127.0.0.1:{port}`; the packaged
  layout guarantees `static_dir()` finds the SPA.
- **Port discovery:** Approach C1 — poll the data-dir `.port` file, then `GET /health`
  before `loadURL`.
- **Packaging:** one `extraResources` FileSet mapping the CI-validated staged
  `entry.dist/` → `resources/backend/`; keep the ASAR thin (main.js + preload.js only).
- **Frontend:** NO changes required (key finding).

## Risks

- **Windows signal delivery is fiction for graceful shutdown** — `child.kill('SIGTERM')`
  is `TerminateProcess`. Mitigated by the shutdown endpoint + `/F` fallback; hard-kill
  tolerance already CI-proven.
- **Draft packaging layout mismatch** (`frontend/dist` → `resources/frontend`, missing
  `alembic.ini`) breaks the frozen bundle. Mitigated by packaging the staged layout
  verbatim.
- **Double-backend race** (orphan after Electron crash → stale `.port` → second backend
  on a new port → two writers on the same SQLite). Mitigated by reuse-alive probe +
  single-instance lock + kill-on-quit.
- **Path drift** between Python `%APPDATA%` and Electron `app.getPath('appData')` — same
  value on Windows; centralize the derivation and cover dev mode (Linux: `backend/data`).
- **Windows console flash** when spawning the exe — mitigated with `windowsHide`.
- **Bundle size** — Nuitka (~120 MiB) + Electron ≈ 250–350 MiB NSIS; accepted cost,
  documented.
- **No single test runner** — backend pytest + frontend vitest per-project; Electron
  main-process logic needs its own runner (node:test) and CI smoke extension.

## Ready for Proposal

Yes — the orchestrator should launch `sdd-propose` for `fase2-frontend-electron` with
the recommendations above. User-facing scope decision for the proposal: whether the
shutdown endpoint backend delta is acceptable (recommended: yes).