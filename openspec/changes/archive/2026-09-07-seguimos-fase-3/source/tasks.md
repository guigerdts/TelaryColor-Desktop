# Tasks: Fase 3 — Real-Runtime Resilience

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1180 total (code+test, incl. binary icons) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4a/4b (see Work Units) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

> **FLAG**: `retry.js` + its integration tests alone ≈ 530 lines — exceeds the 400 budget. Sub-split into PR 4a (core module + unit tests, ~310) and PR 4b (integration tests + main.js retry wiring, ~220). Orchestrator to confirm split.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Foundation: constants, notifications, package.json dep, assets icons | PR 1 (~195+binary) | `cd electron && node --test test/constants.test.js test/notifications.test.js` | Void/Notification mock; N/A for CI | Revert `constants.js` additions, delete `notifications.js` + test, revert `package.json`, delete `assets/` |
| 2 | Tray module + main.js tray wiring (second-instance, window-all-closed) | PR 2 (~325) | `cd electron && node --test test/tray.test.js test/main.test.js` | Mock Tray/Menu/BrowserWindow; `npm start` smoke | Delete `tray.js` + test; revert main.js tray block (window-all-closed just quits again) |
| 3 | Updater module + release-desktop.yml + publish config | PR 3 (~195) | `cd electron && node --test test/updater.test.js` | Mock autoUpdater; CI `v*` tag run | Delete `updater.js` + test, revert `publish` block, delete workflow |
| 4a | retry.js core state machine + unit tests (backoff, transitions, port probe) | PR 4a (~310) | `cd electron && node --test test/retry.test.js` | Fake child EventEmitter + mocked `resolveBackend` | Delete `retry.js` + test |
| 4b | retry integration tests + main.js retry wiring + notification wiring; remove old crash handler | PR 4b (~220) | `cd electron && node --test test/main.test.js test/retry.integration.test.js` | Mock Electron APIs over fake backend process | Revert main.js retry block; re-add old dialog+quit handler |

## Phase 1: Foundation

- [x] 1.1 Add to `electron/src/constants.js`: `MAX_RESTART_ATTEMPTS: 3`, `RETRY_BASE_DELAY_MS: 1000`, `PORT_PROBE_TIMEOUT_MS: 5000`, `UPDATE_CHECK_DELAY_MS: 3000`, `APP_USER_MODEL_ID: 'com.telarycolor.desktop'`.
- [x] 1.2 Create `electron/src/notifications.js`: `notify({title, body})` wraps `Notification`, respects `Notification.isSupported()`, falls back to `console.log`; `initNotifications({appUserModelId})` calls `app.setAppUserModelId`; export Spanish copy constants (`Backend iniciado`, `Reiniciando backend (intento N)`, `Backend fallido`, `Actualización disponible`).
- [x] 1.3 Update `electron/test/constants.test.js`: assert the 5 new frozen retry/update constants.
- [x] 1.4 Create `electron/test/notifications.test.js`: mock `Notification` — verify constructor args, `initNotifications` passes appUserModelId, unsupported/permission-denied falls back without throwing.
- [x] 1.5 Modify `electron/package.json`: add `electron-updater` to `dependencies`; add `publish: {provider: 'github', owner, repo}` to `build` block.
- [x] 1.6 Create `electron/assets/tray-icon.png` (16x16) and ensure `electron/assets/icon.ico` present for tray + window.

## Phase 2: Tray Quick-Access

- [x] 2.1 Create `electron/src/tray.js`: `createTray({mainWindow, isQuitting, onQuit}, deps?)` — `Tray` with menu "Abrir TelaryColor" (`show()`/`hide()` toggle) and "Salir" (`onQuit()`); return tray for `second-instance`.
- [x] 2.2 Update `electron/main.js`: create tray after window; `window-all-closed` no-op while tray present; `second-instance` calls `mainWindow.show()` if hidden before focus; wire `isQuitting`.
- [x] 2.3 Create `electron/test/tray.test.js`: mock `Tray`/`Menu`: verify two menu items, "Salir" triggers `onQuit`, "Abrir" toggles show/hide, `second-instance` reveals hidden window.
- [x] 2.4 Update `electron/test/main.test.js`: assert tray wiring, `window-all-closed` no-op, `second-instance` show path (red crash-handler assertions replaced in Phase 4b).

## Phase 3: Auto-Update + CI

- [x] 3.1 Create `electron/src/updater.js`: `initUpdater({onAvailable}, deps?)` — `checkForUpdates()` non-blocking on ready after `UPDATE_CHECK_DELAY_MS`; `onAvailable(version)` callback; export `quitAndInstall()` wrapping `autoUpdater.quitAndInstall()`.
- [x] 3.2 Create `electron/test/updater.test.js`: mock `autoUpdater` — verify `checkForUpdates` called once after delay, `onAvailable` fires with version, `quitAndInstall` invoked, channel defaults to `latest`.
- [x] 3.3 Create `.github/workflows/release-desktop.yml`: trigger on `v*` tags; `contents: write`; `GH_TOKEN` env; run electron tests, `npx electron-builder --win --x64 --publish always`; upload NSIS installer + `latest` channel metadata.

## Phase 4: Crash Retry

- [x] 4.1 Create `electron/src/retry.js`: `startCrashRetry({backendState, exePath, dataDir, portFile, isPackaged, onReload, onPermanentFail, notify}, deps?)` — state machine idle→detecting→retrying-same-port→retrying-different-port→success/failed; `child.on('exit')` with `!isQuitting` gate; backoff `setTimeout(1000 * 2^attempt)`; calls `resolveBackend()`; `onReload(port)` re-applies `will-navigate` + `loadURL`; port change → `notify` re-login; reused-child exit → no-op; max 3 → `onPermanentFail()`.
- [x] 4.2 Create `electron/test/retry.test.js` (unit): fake child `EventEmitter` + mocked `resolveBackend` — assert attempt counting, `1000*2^attempt` timing (fake timers), same-port vs different-port paths, reused-child no-op, attempt exhaustion triggers `onPermanentFail`.
- [x] 4.3 Update `electron/main.js`: replace L111-123 crash handler (dialog+quit) with `startCrashRetry(...)`; wire `onReload` (rebind will-navigate + loadURL), `onPermanentFail` (error dialog + `app.quit()`), and notification dispatch (backend started/restarted/update).
- [x] 4.4 Create `electron/test/retry.integration.test.js`: mock Electron APIs + fake backend process — retry→reload→window flow, port-change→re-login notification, permanent-fail→dialog+quit, notification wiring on start/restart/update.
- [x] 4.5 Run `cd electron && node --test test/` — all suites green; confirm `frontend/` untouched (`git diff --quiet HEAD -- frontend/`).

## Key Learnings

<!-- populated by sdd-tasks agent before return -->
