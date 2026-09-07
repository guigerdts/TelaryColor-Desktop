# Delta for electron-shell

## Decision: X button is NOT close-to-tray

The window close (X) button MUST retain its normal behavior — real quit through the existing `before-quit` → `shutdown()` → `hardKill` chain. It MUST NOT be intercepted to minimize-to-tray. This **diverges** from `MIGRATION_FASES.md` §3.2/§8.6 (which specifies X → minimize-to-tray); the divergence is deliberate and documented here as a product decision. Rationale: the app must never exit without running the verified shutdown chain, and hiding-on-close risks leaving a backend running invisibly. (Previously recorded as: "X minimizes to tray".)

## ADDED Requirements

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

## Open Design Question

- **Re-detect same port vs re-login on port change:** covering port-first probe so `localStorage`/JWT survives restart is a design decision. Unless same-port-first probing succeeds, an explicit "log in again" notification MUST be shown — never silent session loss. Recorded as TBD for the design phase, required before apply.
