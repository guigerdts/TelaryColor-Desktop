# Tasks: Fase 2 — Electron Shell Integration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 620–720 total (backend ~80, electron ~500, CI/packaging ~90) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 (see Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Backend shutdown endpoint + entry.py D1 refactor + backend tests | PR 1 (~80 lines) | `pytest backend/tests/test_entry.py backend/tests/test_shutdown.py -v` | Real uvicorn mock (subprocess wrapper) + FastAPI TestClient for shutdown route | Revert `backend/entry.py`, `backend/app/main.py`, `backend/tests/test_entry.py`, delete `backend/tests/test_shutdown.py` — no electron impact |
| 2 | Electron foundation: constants, paths, http-client, backend-process, lifecycle, main.js, preload.js + all node:test unit/integration tests | PR 2 (~500 lines) | `cd electron && node --test test/` | `node -e` fake backend stubs; no Electron runtime required for src/* tests | Delete entire `electron/` directory — no backend impact |
| 3 | CI workflow gates + electron-builder packaging + assets + verify-layout | PR 3 (~90 lines) | `git diff --quiet HEAD -- frontend/` (gate), `cd electron && npx electron-builder --win --x64` (packaging) | Full CI workflow run; packaged layout assertion step | Revert `.github/workflows/build-backend-windows.yml`, delete `electron/package.json` build block, delete `electron/assets/` |

## Phase 1: Backend Delta — Shutdown Endpoint + D1 Refactor

- [x] 1.1 Modify `backend/entry.py`: replace `uvicorn.run(app, ...)` with explicit `uvicorn.Config(app, host="127.0.0.1", port=port, log_level="info")` + `uvicorn.Server(config)` stored as `app.state.server` before `server.run()`. Keep `from app.main import app` static trace for freezer. (~15 lines changed)
- [x] 1.2 Add `POST /api/v1/system/shutdown` route in `backend/app/main.py`: create `system_router` with endpoint that reads `request.app.state.server` and sets `should_exit = True`, returns `{"status": "shutting_down"}`. Register via `app.include_router(system_router)` AFTER `health_router` and BEFORE `_UploadsRoute()` / `_mount_spa(app)`. Loopback-only, unauthenticated. (~20 lines added)
- [x] 1.3 Update `backend/tests/test_entry.py` wrapper: mock `uvicorn.Config` and `uvicorn.Server` instead of `uvicorn.run`. Assert `Server` was instantiated, `server.run()` was called, and `app.state.server` is the `Server` instance. Update `test_uvicorn_receives_app_object` to match new mock shape. (~15 lines changed)
- [x] 1.4 Write `backend/tests/test_shutdown.py`: (RED) test route exists before SPA catch-all via `app.router.routes` ordering; test `POST /api/v1/system/shutdown` returns 200 with `{"status": "shutting_down"}`; test `app.state.server.should_exit` is set to `True` after call; test non-loopback client cannot reach the port (bind-level). Use `fastapi.testclient.TestClient` with mock `app.state.server`. (~30 lines)
- [x] 1.5 Run `pytest backend/tests/test_entry.py backend/tests/test_shutdown.py -v` — all pass. Verify existing tests unbroken.

## Phase 2: Electron Foundation — Modules + Tests

- [x] 2.1 Create `electron/package.json`: `"main": "main.js"`, scripts (`start`, `test`, `dist`), `devDependencies` (`electron`, `electron-builder`). (~30 lines)
- [x] 2.2 Create `electron/src/constants.js`: freeze `BACKEND_PROBE_TIMEOUT_MS: 3000`, `SHUTDOWN_GRACE_TIMEOUT_MS: 5000`, `PORT_POLL_INTERVAL_MS: 100`, `PORT_POLL_TIMEOUT_MS: 10000`, `HEALTH_GATE_TIMEOUT_MS: 5000`. (~12 lines)
- [x] 2.3 Create `electron/src/paths.js`: `backendExePath(isPackaged)` — packaged: `path.join(process.resourcesPath, 'backend', 'telarycolor-server.exe')`, dev: `path.join(repoRoot, 'backend', 'entry.py')`; `dataDir(isPackaged)` — packaged: `path.join(app.getPath('appData'), 'TelaryColor', 'data')`, dev: `path.join(repoRoot, 'backend', 'data')`; `portFile(isPackaged)` — `path.join(dataDir(isPackaged), '.port')`. (~35 lines)
- [x] 2.4 Create `electron/src/http-client.js`: `probeHealth(port)` — `fetch` GET `http://127.0.0.1:{port}/health` with `signal: AbortSignal.timeout(BACKEND_PROBE_TIMEOUT_MS)`, returns `true` on 200, `false` on error/timeout; `requestShutdown(port)` — `fetch` POST `http://127.0.0.1:{port}/api/v1/system/shutdown`, returns response status. Both use Node 20 global `fetch`. (~45 lines)
- [x] 2.5 Create `electron/src/backend-process.js`: `spawnBackend(exePath)` — `child_process.spawn(exePath, [], {detached: false, windowsHide: true, stdio: 'ignore'})`, returns `ChildProcess`; `pollPortFile(portFile, timeoutMs)` — poll at `PORT_POLL_INTERVAL_MS` up to `PORT_POLL_TIMEOUT_MS`, reject on timeout; `waitHealth(port, timeoutMs)` — poll the health endpoint at 200ms cadence up to `HEALTH_GATE_TIMEOUT_MS`; `waitExit(child, timeoutMs)` — `Promise` that resolves on child `'exit'` event or rejects on timeout; `hardKill(pid)` — `taskkill /F /T /PID {pid}` on Windows, `process.kill(pid, 'SIGKILL')` otherwise. (~110 lines)
- [x] 2.6 Create `electron/src/lifecycle.js`: `resolveBackend({exePath, dataDir, portFile, isPackaged})` — read `.port` → `probeHealth()` → reuse if healthy, else `spawnBackend()` → `pollPortFile()` → `waitHealth()` → return `{mode, child, port}`; `shutdown({mode, child, port})` — if `mode === 'reused'` no-op; if `spawned`: `requestShutdown(port)` → `waitExit(child, SHUTDOWN_GRACE_TIMEOUT_MS)` → on timeout `hardKill(child.pid)`. (~90 lines)
- [x] 2.7 Create `electron/test/constants.test.js`: assert all 5 frozen values match spec (3000, 5000, 100, 10000, 5000). (~15 lines)
- [x] 2.8 Create `electron/test/paths.test.js`: assert `dataDir(false)` ends with `backend/data`, `portFile(false)` ends with `.port`. (~15 lines)
- [x] 2.9 Create `electron/test/http-client.test.js`: local `http.createServer` stub — health 200 → `probeHealth` returns true; never-responding server → returns false within probe timeout; POST shutdown → asserts method + path on server. (~50 lines)
- [x] 2.10 Create `electron/test/backend-process.test.js`: spawn real `node -e` fake backend that writes `.port` + serves health on an ephemeral port; `pollPortFile` finds port; ENOENT port file → rejects; early child exit → error. (~60 lines)
- [x] 2.11 Create `electron/test/lifecycle.test.js`: fake `EventEmitter` child — exit within grace → no `hardKill` invoked; timeout → `taskkill /F /T /PID` command constructed (Windows branch on `win32`, `SIGKILL` otherwise); reused mode → `shutdown()` is no-op. (~65 lines)
- [x] 2.12 Run `cd electron && node --test test/` — all node:test green.

## Phase 3: Composition Root — main.js + preload.js

- [x] 3.1 Create `electron/main.js`: composition root — `app.requestSingleInstanceLock()` → lock holder continues, second instance `app.quit()` + `app.on('second-instance', focus)`; call `resolveBackend()` → on error `dialog.showErrorBox()` + `app.quit()`; `createBrowserWindow({webPreferences: {contextIsolation: true, nodeIntegration: false, sandbox: true, preload: ...}})` with `show: false`, `backgroundColor: '#0f172a'`; `ready-to-show` → `show: true`; `will-navigate` deny non-`127.0.0.1` origins; `setWindowOpenHandler` deny all; `loadURL('http://127.0.0.1:{port}')`; `app.on('before-quit')` → `lifecycle.shutdown()`; `child.on('exit')` while window open → `dialog.showErrorBox()` + `app.quit()`. (~95 lines)
- [x] 3.2 Create `electron/preload.js`: `contextBridge.exposeInMainWorld('electronAPI', {version: process.versions.electron, platform: process.platform, isElectron: true})`. Read-only, no IPC. (~12 lines)
- [x] 3.3 Run `cd electron && node --test test/` — all existing tests still green.

## Phase 4: CI Integration — Frontend Gate + Electron Packaging

- [x] 4.1 Modify `.github/workflows/build-backend-windows.yml`: add `fetch-depth: 0` to Checkout step. (~1 line)
- [x] 4.2 Add **fail-fast: frontend touched** step immediately after Checkout, before Python setup: `git diff --quiet HEAD -- frontend/` with `::error::` message + exit 1. (~5 lines)
- [x] 4.3 Add **fail-fast vs base (push)** step: `if: github.event_name == 'push'`, `git diff --quiet "${{ github.event.before }}" HEAD -- frontend/` with error message + exit 1. (~5 lines)
- [x] 4.4 Add **post-build dist drift check** step after frontend build: `git diff --quiet HEAD -- frontend/dist` with error message. (~5 lines)
- [x] 4.5 Add **electron deps** step: `npm ci` with `working-directory: electron/`. (~3 lines)
- [x] 4.6 Add **electron main-process tests** step: `npm test` with `working-directory: electron/`. (~3 lines)
- [x] 4.7 Add **package desktop app** step: `npx electron-builder --win --x64` with `working-directory: electron/`. (~3 lines)
- [x] 4.8 Add **verify packaged layout** step: assert `resources/backend/telarycolor-server.exe`, `resources/backend/alembic/versions`, `resources/backend/alembic.ini`, `resources/backend/frontend/dist/index.html` exist in `electron/dist/win-unpacked/`. (~10 lines)
- [x] 4.9 Add `electron/**` to workflow trigger `paths:`. (~1 line)
- [x] 4.10 Add **upload desktop artifact** step: `dist/win-unpacked/**` + `dist/TelaryColor-Setup-*.exe`, `if-no-files-found: error`. (~8 lines)
- [x] 4.11 Add electron-builder config block to `electron/package.json`: `files` (main.js, preload.js, src/**, package.json), `extraResources` (one FileSet: `{from: ../build/entry.dist, to: backend}`), `win` (nsis x64, icon), `nsis` options, `asar: true`, `npmRebuild: false`. (~20 lines)
- [x] 4.12 Copy/create `electron/assets/icon.ico` from frontend PWA icon. (binary, 0 code lines)
- [x] 4.13 Final verification: `git diff --stat` — confirm `frontend/` has zero changes.

## Key Learnings

<!-- populated by sdd-tasks agent before return -->
