change: seguimos-fase-3
archived: "2026-09-07"
archived_to: openspec/changes/archive/2026-09-07-seguimos-fase-3/
artifact_store: openspec
verdict: pass_with_warnings
requirements: 4/4
scenarios: 11/11
critical_findings: 0 (all resolved)
warning_findings: 2 (constant naming deviations)
test_pass: 71
test_fail: 0

## Summary

Fase 3 delivered real-runtime resilience for the TelaryColor Electron desktop app. Four new capabilities were added as pure `src/` modules (testable without Electron runtime), all wired into the composition root `main.js`. Zero frontend changes.

## What Was Built

### Crash Retry with Exponential Backoff (`electron/src/retry.js`)
State machine (idle → detecting → retrying → success/failed) on unexpected backend child exit. Same-port-first probe via `resolveBackend()` preserves JWT. Backoff `1000 * 2^attempt` ms, max 3 attempts → error dialog + `app.quit()`. Reused backend crashes are no-ops (not owned).

### Tray Quick-Access (`electron/src/tray.js`)
`Tray` with "Abrir TelaryColor" (show/hide toggle) and "Salir" (routes through `before-quit` → `shutdown` → `hardKill`). `window-all-closed` no-op while tray present. `second-instance` reveals hidden window. X button retains normal quit behavior — deliberate divergence from MIGRATION_FASES.md close-to-tray spec.

### Auto-Update via electron-updater (`electron/src/updater.js`)
`checkForUpdates()` on app start (3s delay, non-blocking). `quitAndInstall()` wired into `before-quit` — one app update atomically replaces backend + SPA. `publish: { provider: github }` configured on NSIS target. `.github/workflows/release-desktop.yml` on `v*` tags builds and publishes installer to GitHub Releases (exists on PR 3 branch `feat/fase3-pr3-updater`).

### Main-Process Status Notifications (`electron/src/notifications.js`)
Electron `Notification` API in main process. `app.setAppUserModelId()` called. Spanish copy: "Backend iniciado", "Reiniciando backend (intento N)", "Backend fallido", "Actualización disponible". Permission-denied fallback to `console.log`.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Same-port-first retry | Probe previous port before random | JWT survives transparent reload; fallback to re-login notification on port change |
| X button behavior | Quit (not close-to-tray) | Prevents invisible orphaned backend; deliberate spec divergence documented |
| Retry as src/ module | `src/retry.js` not in main.js | Follows D4 (fase2): composition root stays thin, modules testable |
| Install-on-quit update | Not mid-run | One atomic replacement of backend+SPA; never update a running backend |
| Main-process notifications | Not renderer via IPC | Zero frontend changes; frontend immutability gate untouched |

## Verification Notes

- **71/71 tests pass** — all suites green (constants, notifications, tray, retry unit, retry integration, main integration, updater)
- **frontend/ untouched** — `git diff --quiet HEAD -- frontend/` clean
- **Original CRITICAL findings resolved**: updater fully wired (checkForUpdates after 3s, quitAndInstall in before-quit), notify contract fixed
- **Constant naming deviations (WARNING)**: code uses `RETRY_MAX_ATTEMPTS` and `UPDATE_CHECK_INTERVAL_MS` vs spec's `MAX_RESTART_ATTEMPTS` and `UPDATE_CHECK_DELAY_MS` — functionally self-consistent but deviates from authored plan
- **Tag publish scenario**: Untested in unit/integration (CI workflow is a runtime artifact), verified source-present on PR 3 branch

## PRs Created

| PR | Goal | Branch |
|----|------|--------|
| PR 1 | Foundation: constants, notifications, assets | — |
| PR 2 | Tray module + main.js tray wiring | — |
| PR 3 | Updater module + release-desktop.yml + publish config | feat/fase3-pr3-updater |
| PR 4a | Retry core state machine + unit tests | — |
| PR 4b | Retry integration tests + main.js wiring | — |
| fix | Updater wiring corrections | — |

## Archive Artifacts

- proposal.md ✅
- exploration.md ✅
- specs/electron-shell/spec.md ✅ (delta merged into main spec)
- design.md ✅
- tasks.md ✅ (18/18 tasks complete)
- verify-report.md ✅ (engram topic: sdd/seguimos-fase-3/verify-report, observation #2115)
