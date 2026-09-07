# Electron Shell Specification

## Purpose

Electron shell wrapping the Fase 1 packaged backend: probe-or-spawn the backend child process, discover its port via the `.port` contract, health-gate and load the SPA from `http://127.0.0.1:{port}`, and orchestrate graceful shutdown. Frontend untouched.

## Requirements

### Requirement: Backend Reuse Probe

Before spawning, the system MUST probe: read `<data-dir>/.port`; if present, GET `/health` on `http://127.0.0.1:{port}` within `BACKEND_PROBE_TIMEOUT_MS`. Healthy → reuse, no spawn. Unresponsive or missing → treat as dead.

#### Scenario: Second launch reuses live backend (Scenario A — happy path)

- GIVEN a live backend running with a valid `.port` file
- WHEN Electron starts a second instance
- THEN it detects the live backend via `.port` + `/health` and does NOT spawn a new one

#### Scenario: Stale orphan .port recovers (Scenario A — zombie case)

- GIVEN a stale `.port` exists but `/health` does not respond within `BACKEND_PROBE_TIMEOUT_MS` (previous process crashed midway)
- WHEN Electron starts
- THEN it treats the backend as dead, spawns a fresh one without hanging, and the new backend overwrites the stale `.port`

### Requirement: Backend Spawn

No live backend → the system MUST spawn the exe with `windowsHide: true`, `detached: false`. Failure MUST show an error dialog and quit.

#### Scenario: Console hidden

- GIVEN a Windows host spawns the backend exe
- WHEN the child starts
- THEN no console window flashes

#### Scenario: Missing backend exe

- GIVEN the backend exe is absent
- WHEN spawn is attempted
- THEN an error dialog is shown and the app quits

### Requirement: Port Discovery Contract

The system MUST poll `.port` at `app.getPath('appData')/TelaryColor/data/.port` (frozen, matching `%APPDATA%/TelaryColor`) or `backend/data/.port` (dev). `.port` is canonical; stdout is secondary only; the draft `/port (\d+)/` regex MUST NOT be used.

#### Scenario: Port file is canonical

- GIVEN a spawned backend writes `.port` at boot
- WHEN Electron polls the data dir
- THEN it reads the port from `.port`, never from stdout parsing

### Requirement: Health Gate Before Window Load

The system MUST wait for `GET /health` → 200 on the discovered port before loading the window.

#### Scenario: Window loads after health gate

- GIVEN the backend answers `/health` 200
- WHEN the BrowserWindow loads `http://127.0.0.1:{port}`
- THEN the SPA renders in ≤3s and offline login works

### Requirement: Secure BrowserWindow

The system MUST load `http://127.0.0.1:{port}` (never `file://`, which breaks `/api`, `/uploads`, localStorage) with `contextIsolation: true`, `nodeIntegration: false`, minimal preload bridge.

#### Scenario: Single-origin SPA works

- GIVEN the window loads from localhost
- WHEN the SPA issues relative `/api/v1/*` and `/uploads/*` requests
- THEN they are same-origin and localStorage persists

### Requirement: Graceful Shutdown Orchestration

On quit the system MUST call `POST /api/v1/system/shutdown`, wait up to named constant `SHUTDOWN_GRACE_TIMEOUT_MS` (5000), then `taskkill /F /T` (Windows) only as last resort. WAL recovery is a safety net, NOT the normal shutdown method.

#### Scenario: Graceful stop, hard kill only post-timeout (Scenario B)

- GIVEN Electron owns the backend process
- WHEN the user closes the app
- THEN Electron calls `POST /api/v1/system/shutdown` first, waits up to `SHUTDOWN_GRACE_TIMEOUT_MS` = 5000, and runs `taskkill /F /T` only if the process is still alive after that timeout

#### Scenario: Exit within grace window

- GIVEN the backend exits after the shutdown call
- WHEN the grace window is still open
- THEN no hard kill is issued; SQLite WAL guarantees DB integrity

### Requirement: Single-Instance Lock

The system MUST acquire `app.requestSingleInstanceLock()`; a second instance MUST quit and focus the first — extra layer against double-backend.

#### Scenario: Second instance focuses first

- GIVEN one instance holds the lock
- WHEN a second instance launches
- THEN it exits and the first window is focused

### Requirement: Data Path Derivation

The system MUST centralize: `app.getPath('appData')/TelaryColor/...` packaged (mirroring backend `%APPDATA%/TelaryColor`), `backend/data` dev.

#### Scenario: Packaged and dev paths

- GIVEN a packaged install
- WHEN the data dir is derived
- THEN it equals `%APPDATA%/TelaryColor` (dev: `backend/data`)

### Requirement: Packaging Layout

electron-builder MUST copy staged `entry.dist/` verbatim to `resources/backend/` — including `alembic/`, `alembic.ini`, `frontend/dist` — and keep ASAR thin (only `main.js` + `preload.js`).

#### Scenario: Staged bundle packaged verbatim

- GIVEN `entry.dist/` passed the Fase 1 smoke test
- WHEN electron-builder packages via `extraResources`
- THEN `resources/backend/` mirrors it exactly; SPA, `/uploads`, localStorage, migrations work

### Requirement: Main-Process Tests

The system MUST test main-process logic (probe, spawn, discovery, health gate, shutdown) with `node:test`, green in CI.

#### Scenario: node:test green in CI

- GIVEN a node:test suite covers main-process lifecycle logic
- WHEN CI runs the electron test command
- THEN all tests pass

### Requirement: Frontend Immutability Gate

CI MUST fail when any `frontend/` file changed, via an automatable check (`git diff --quiet HEAD -- frontend/`) — not manual review.

#### Scenario: Frontend untouched is enforced (Scenario C)

- GIVEN a change set modifies a file under `frontend/`
- WHEN the CI step runs `git diff --quiet HEAD -- frontend/`
- THEN the build fails, keeping `git diff frontend/` empty

## Decision: X button is NOT close-to-tray

The window close (X) button MUST retain its normal behavior — real quit through the existing `before-quit` → `shutdown()` → `hardKill` chain. It MUST NOT be intercepted to minimize-to-tray. This **diverges** from `MIGRATION_FASES.md` §3.2/§8.6 (which specifies X → minimize-to-tray); the divergence is deliberate and documented here as a product decision. Rationale: the app must never exit without running the verified shutdown chain, and hiding-on-close risks leaving a backend running invisibly.

### Requirement: Crash Retry with Exponential Backoff

On unexpected backend child exit while the window is open (and not shutting down), the system MUST notify, wait `1000 * 2^attempt` ms, re-run `resolveBackend()` (probe-or-spawn), re-apply the `will-navigate` allowlist to the resolved port, and `loadURL` it. Max `MAX_RESTART_ATTEMPTS` = 3; after the 3rd failure the system MUST show the existing error dialog and quit. Retry MUST reuse `resolveBackend()` and MUST NOT create a separate spawn path.

#### Scenario: Transient crash self-heals

- GIVEN a spawned backend exits unexpectedly with code ≠ 0 and the app is not shutting down
- WHEN the retry handler fires after `1000 * 2^attempt` ms
- THEN `resolveBackend()` re-runs, the window re-targets the (possibly new) port, and the SPA reloads

#### Scenario: Recurring crash gives up

- GIVEN the backend exits again after 3 restart attempts
- WHEN attempt 3 fails
- THEN an error dialog is shown and the app quits via the existing chain

#### Scenario: Reused backend crashes

- GIVEN `backendState.child` is null (backend was reused, not spawned by us)
- WHEN an unexpected exit is detected
- THEN no restart is attempted and no dialog is shown (a reused backend is not owned)

### Requirement: Tray Quick-Access

The system MUST create a `Tray` with a menu "Abrir TelaryColor" and "Salir". "Salir" MUST set `isQuitting = true` and call `app.quit()`, routing through the existing `before-quit` shutdown chain. The "Abrir TelaryColor" item MUST show/hide the main window (`show()` / `hide()`). `window-all-closed` MUST NOT quit while the tray is present. `second-instance` MUST call `show()` on a hidden window before focusing. Tray and window icons MUST be provided under `electron/assets/`.

#### Scenario: Show/hide via tray

- GIVEN the app is running with the window hidden
- WHEN the user clicks "Abrir TelaryColor"
- THEN the window is shown

#### Scenario: Salir uses the shutdown chain

- GIVEN the tray menu is open
- WHEN the user clicks "Salir"
- THEN `isQuitting` is set, `app.quit()` runs, and the existing `before-quit` → `shutdown()` → `hardKill` chain executes

#### Scenario: second-instance reveals hidden window

- GIVEN the window is hidden (via tray) and another instance launches
- WHEN the single-instance lock triggers `second-instance`
- THEN the window is shown and focused

### Requirement: Auto-Update via electron-updater

The system MUST add `electron-updater` and configure `publish: { provider: github }` on the NSIS target, defaulting to the `latest` channel. A tag-triggered `.github/workflows/release-desktop.yml` on `v*` tags MUST build and publish the NSIS installer to GitHub Releases with `contents: write` and `GH_TOKEN`. Auto-update MUST be checked on app start (non-blocking). One app update atomically replaces backend + SPA. Code signing is a known limitation: unsigned installers will trigger SmartScreen warnings, accepted for this phase.

#### Scenario: Tag publishes installer

- GIVEN a `v*` tag is pushed with `GH_TOKEN` set
- WHEN the release workflow runs
- THEN an NSIS installer is published to GitHub Releases with `latest` channel metadata

#### Scenario: Installed build updates

- GIVEN an installed build from a prior release
- WHEN a newer release exists and the app checks for updates
- THEN `electron-updater` downloads and installs on quit, replacing backend + SPA atomically

### Requirement: Main-Process Status Notifications

The system MUST call `app.setAppUserModelId()` and use Electron's `Notification` API in the main process for backend-started, backend-restarted (attempt N), and update-available events. Notification copy MUST be Spanish. The system MUST NOT add any `frontend/` changes.

#### Scenario: Backend started notification

- GIVEN the backend resolves successfully on first launch
- WHEN `resolveBackend()` returns
- THEN a main-process notification "Backend iniciado" is shown

#### Scenario: Backend restarted notification

- GIVEN a crash triggers restart attempt N
- WHEN the backoff timer fires
- THEN a notification "Reiniciando backend (intento N)" is shown

#### Scenario: Update available notification

- GIVEN `electron-updater` finds a newer version
- WHEN the check completes
- THEN a Spanish notification indicating an update is available is shown