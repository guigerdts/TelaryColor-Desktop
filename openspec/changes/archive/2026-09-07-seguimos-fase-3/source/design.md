# Design: Fase 3 — Real-Runtime Resilience

## Technical Approach

Four new Electron main-process capabilities built as pure `src/` modules (testable without Electron runtime), wired into the composition root `main.js`. All reuse `resolveBackend()` from `lifecycle.js` — no duplicate spawn paths. Zero renderer/frontend changes.

## Architecture Decisions

| # | Decision | Options | Choice / Rationale |
|---|---|---|---|
| D1 | **Same-port-first retry** | (a) always random port; (b) probe previous port first | **Chosen: (b).** After crash, OS releases port fast → `resolveBackend()` reads `.port` → probes same port → transparent SPA reload (JWT survives). Falls back to random only if port unavailable → re-login notification. |
| D2 | **X button vs tray** | (a) X → hide to tray (MIGRATION_FASES §3.2/§8.6); (b) X → quit | **Chosen: (b).** Hiding on close risks invisible orphaned backend. X always runs `before-quit` → `shutdown` → `hardKill`. Tray is show/hide only. Explicit divergence from MIGRATION_FASES.md — documented in delta spec §Decision. |
| D3 | **Retry as src/ module** | (a) logic in main.js; (b) `src/retry.js` | **Chosen: (b).** Follows D4 (fase2): `main.js` is composition root only; testable modules in `src/`. |
| D4 | **Tray + updater as separate modules** | (a) monolith; (b) `src/tray.js`, `src/updater.js` | **Chosen: (b).** One module per concern; `main.js` wires them at startup. |
| D5 | **Auto-update timing** | (a) update while backend runs; (b) install-on-quit | **Chosen: (b).** One app update atomically replaces backend+SPA. Never mid-run. |
| D6 | **Notifications in main process** | (a) renderer via IPC; (b) `Notification` API in main | **Chosen: (b).** Spec mandates main-process only; no renderer changes. |

## Data Flow

### Crash Retry State Machine

```
                    child.on('exit')
                         │
                    ┌────▼────┐
                    │ IDLE    │ (backendState.child exists, window open)
                    └────┬────┘
                         │ unexpected exit, !shuttingDown
                    ┌────▼──────────┐
                    │ DETECTING     │ save lastKnownPort from backendState.port
                    └────┬──────────┘
                         │ attempt < MAX_RESTART_ATTEMPTS (3)
                    ┌────▼──────────────────┐
                    │ WAITING_BACKOFF        │ setTimeout(1000 * 2^attempt)
                    └────┬──────────────────┘
                         │
                    ┌────▼──────────────────┐
                    │ RETRYING              │ resolveBackend() runs
                    └────┬──────────────────┘
                         │
              ┌──────────┼──────────┐
              │                     │
        same port reused       different port
              │                     │
        ┌─────▼──────┐      ┌──────▼────────┐
        │ SUCCESS     │      │ PORT_CHANGED  │
        │ reload URL  │      │ notify re-login│
        │ notify      │      │ reload to new  │
        └─────┬──────┘      └──────┬────────┘
              │                     │
              └──────────┬──────────┘
                         │ if child exists → re-attach exit listener
                         ▼
                      IDLE
                         │ attempt >= 3
                    ┌────▼──────────┐
                    │ PERMANENT_FAIL│ dialog + app.quit()
                    └───────────────┘
```

### Tray Lifecycle

```
    ┌──────────────┐     "Abrir"      ┌──────────────┐
    │ WINDOW_HIDDEN│◄─────────────────│ WINDOW_VISIBLE│
    └──────┬───────┘                   └──────┬───────┘
           │ click "Abrir"                    │ click "Salir"
           │ (show + focus)                   │ (isQuitting = true)
           └────────────►◄───────────────────┘
                                │
                          ┌─────▼──────┐
                          │ APP.QUIT()  │ → before-quit → shutdown → hardKill
                          └────────────┘
    X button: same as "Salir" (always quit, never hide)
    second-instance: show() + focus() if hidden
```

### Auto-Update Flow

```
    app.on('ready')
         │
    ┌────▼──────────────┐
    │ checkForUpdates()  │ non-blocking
    └────┬──────────────┘
         │
    ┌────▼──────────┐         ┌──────────────────┐
    │ NO UPDATE     │         │ UPDATE_AVAILABLE  │
    │ (noop)        │         │ notify user       │
    └───────────────┘         │ quitOnClose = true│
                              └────┬─────────────┘
                                   │ user clicks X / "Salir"
                              ┌────▼─────────────┐
                              │ installOnQuit()   │
                              │ autoUpdater.quitAndInstall()
                              └──────────────────┘
```

### Notification Dispatch Points

```
main.js wiring:
  resolveBackend() success ──────► notify("Backend iniciado")
  retry backoff fires ───────────► notify("Reiniciando backend (intento N)")
  retry attempts exhausted ──────► notify("Backend fallido") + dialog + quit
  updater.updateAvailable ───────► notify("Actualización disponible")
  setAppUserModelId() ───────────► app.on('ready', once)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `electron/src/retry.js` | Create | `startCrashRetry({ backendState, exePath, dataDir, portFile, isPackaged, onReload, onPermanentFail, notify })` — retry state machine, max 3 attempts, backoff `1000 * 2^attempt`. Calls `resolveBackend()` from lifecycle.js. |
| `electron/src/tray.js` | Create | `createTray({ mainWindow, onQuit })` — returns `Tray` with "Abrir TelaryColor"/"Salir" menu. "Salir" calls `onQuit()`. Exports `tray` instance for `second-instance` use. |
| `electron/src/updater.js` | Create | `initUpdater({ onAvailable })` — wraps `electron-updater`. `checkForUpdates()` on ready. `onAvailable` callback fires notification. Exports `quitAndInstall()`. |
| `electron/src/notifications.js` | Create | `notify({ title, body })` — wraps `Notification` API, respects permission, falls back to console.log. Spanish copy constants. `setAppUserModelId('com.telarycolor.desktop')`. |
| `electron/main.js` | Modify | Add `isQuitting` state (replaces `shuttingDown` rename). Wire tray, retry, updater, notifications. Replace L111-123 crash handler with retry call. Add `window-all-closed` no-op while tray present. Update `second-instance` to show hidden window. Add `setAppUserModelId`. |
| `electron/src/constants.js` | Modify | Add: `MAX_RESTART_ATTEMPTS: 3`, `RETRY_BASE_DELAY_MS: 1000`, `PORT_PROBE_TIMEOUT_MS: 5000`, `UPDATE_CHECK_DELAY_MS: 3000`, `APP_USER_MODEL_ID: 'com.telarycolor.desktop'`. |
| `electron/package.json` | Modify | Add `electron-updater` dependency. Add `publish: { provider: 'github', owner, repo }` to build block. |
| `.github/workflows/release-desktop.yml` | Create | Tag-triggered (`v*`), `contents: write`, `GH_TOKEN`, build NSIS + publish to GitHub Releases. |
| `electron/assets/icon.ico` | Create | Tray icon (16x16) + window icon. Deliver as part of this change. |
| `electron/assets/tray-icon.png` | Create | 16x16 tray icon for Windows system tray. |

## Interfaces / Contracts

```js
// src/retry.js
startCrashRetry({ backendState, exePath, dataDir, portFile, isPackaged,
                   onReload, onPermanentFail, notify }, deps?) → void
  // Attaches child.on('exit') to backendState.child
  // onReload(port): re-applies will-navigate + loadURL
  // onPermanentFail(): shows dialog + app.quit()

// src/tray.js
createTray({ mainWindow, isQuitting, onQuit }, deps?) → Tray
  // Menu: "Abrir TelaryColor" (show/hide), "Salir" (onQuit callback)

// src/updater.js
initUpdater({ onAvailable, autoUpdater }, deps?) → { checkForUpdates, quitAndInstall }
  // onAvailable(version): callback for notification
  // autoUpdater defaults to require('electron-updater').autoUpdater

// src/notifications.js
notify({ title, body }, deps?) → void           // wraps Notification API
initNotifications({ appUserModelId }, deps?) → void  // setAppUserModelId
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (`node:test`) | retry.js | Mock `resolveBackend`: test attempt counting, backoff delays, same-port vs different-port paths, max-attempts → callback. Fake child EventEmitter. |
| Unit (`node:test`) | tray.js | Mock `Tray`/`Menu`/`BrowserWindow`: verify menu items, "Salir" calls onQuit, "Abrir" toggles show/hide. |
| Unit (`node:test`) | notifications.js | Mock `Notification`: verify constructor args, Spanish copy, permission-denied fallback. |
| Unit (`node:test`) | constants.js | Assert new constants: MAX_RESTART_ATTEMPTS=3, RETRY_BASE_DELAY_MS=1000. |
| Integration (`node:test`) | main.js wiring | Mock all deps: verify retry→reload→window flows, tray→quit chain, updater→notification. |
| E2E (CI) | Full lifecycle | Existing workflow + new release workflow validation. |

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Subprocess spawn (backend) | Applicable — retry re-spawns via `resolveBackend()` | Same constraints as fase2: `spawn(exe, [], {detached:false, windowsHide:true})`, list args only | Retry: spawn error → dialog+quit; early exit → retry; port conflict → different port |
| Process kill (shutdown) | Applicable — quit chain unchanged | Graceful endpoint first; `taskkill /F /T /PID` after timeout; never touch unowned | Quit flows unchanged from fase2 |
| Documentation-like paths | N/A | — | — |
| Git repository selection | N/A | — | — |
| PR commands | N/A | release workflow uses `gh release` not git push | — |

## Migration / Rollout

No data migration. Drop-in: `electron-updater` added to dependencies, release workflow new. Existing installed builds auto-update on next launch. Rollback: revert `electron/` + delete release workflow. Previous installer remains for manual downgrade.

## Open Questions

- None blocking. PORT/JWT question resolved: same-port-first strategy with re-login fallback documented.
