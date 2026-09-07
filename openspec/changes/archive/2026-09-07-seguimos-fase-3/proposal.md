# Proposal: Fase 3 — Real-Runtime Resilience

## Intent

Fase 2 shipped the shell; a crash still kills the app (`electron/main.js` L111-123); no tray, update, or status path. Fase 3 closes these gaps Electron-side; `frontend/` untouched.

## Scope

### In Scope
- Crash restart + backoff via `resolveBackend()` (no dup)
- Tray quick-access (show/hide; "Salir" item)
- Auto-update (`electron-updater` + tag CI, `GH_TOKEN`)
- Main-process notifications (start/restart/update)

### Out of Scope
- `frontend/` — zero changes; renderer alerts deferred
- Close-to-tray on X — quit chain unchanged (`before-quit` → `shutdown` → `hardKill`)
- Code signing — SmartScreen warnings accepted
- Backend logic changes

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `electron-shell`: + crash-restart, tray, auto-update, notifications (delta via sdd-spec)

## Approach

- **Crash retry** (`main.js` L111-123): unexpected exit & not quitting, < 3 attempts → notify → wait `1000·2^attempt` ms → re-run `resolveBackend()` → re-apply allowlist → `loadURL`; else dialog + quit. Constants in `src/constants.js`.
- **Tray**: menu "Abrir TelaryColor"/"Salir"; Salir → `isQuitting` → `app.quit()` (existing chain); `window-all-closed` keeps app alive; `second-instance` gains `show()`; X untouched. New `electron/assets/` icons.
- **Auto-update**: `electron-updater`, `publish: github`, NSIS; new `.github/workflows/release-desktop.yml` on `v*` tags (`contents: write`, `GH_TOKEN`). One update ships backend+SPA; data survives.
- **Notifications**: Electron `Notification`, main-process; `setAppUserModelId`; Spanish copy.

## Open Design Decision

Re-spawn may rebind the port → new origin → JWT lost. Design MUST evaluate same-port-first probe; else an explicit "log in again" notification — never silent session loss.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `electron/main.js` | Modified | Restart loop, tray, `isQuitting` |
| `electron/src/lifecycle.js` | Modified | `restart()` wraps `resolveBackend()` |
| `electron/src/constants.js` | Modified | Backoff constants |
| `electron/package.json` | Modified | `electron-updater` + `publish` |
| `electron/assets/` | New | Tray icon, icon.ico |
| `.github/workflows/release-desktop.yml` | New | Tag release (none today) |
| `electron/test/` | New | Restart/backoff + quit-flow tests |

## Risks

- Port change → JWT re-login (Med): same-port probe; else re-login toast
- SmartScreen on unsigned installer (High): accepted
- Missing `GH_TOKEN` (Med): CI fails
- Tray × quit interplay (Med): `isQuitting` + tests
- Missing icons / AppUserModelId (Med): assets; CI assert

## Rollback Plan

Revert `electron/` + `package.json`; delete `assets/` + release workflow. Prior release installer remains for manual downgrade. Data untouched.

## Dependencies

- `GH_TOKEN` repo secret; GitHub Releases feed
- `electron-updater` (npm); channel `latest` (confirm before apply)

## Success Criteria

- [ ] Killed backend restarts ≤ 3 w/ backoff; window re-targets
- [ ] X quits via existing chain; tray toggles; "Salir" clean
- [ ] `v*` tag publishes installer; installed build updates
- [ ] Notifications shown; frontend gate passes; `npm test` green