# Exploration: Fase 3 runtime real — gap analysis vs Fase 2 Electron shell

## Current State

**Fase 2 (archived `2026-09-06-fase2-frontend-electron`, verified 14/14 requirements, 0 CRITICAL)** already built the *process orchestration* layer:

- `electron/src/lifecycle.js` — `resolveBackend()` (L36-70): probe-or-spawn. Reads `.port`, `GET /health`, reuses a live backend or spawns + polls `.port` + health-gates. `shutdown()` (L80-98): design D3 ownership — reused backend → no-op; spawned → `POST /api/v1/system/shutdown` → `waitExit(5000)` → `hardKill()`.
- `electron/src/backend-process.js` — `spawnBackend()` (L15-23, `detached:false`, `windowsHide:true`), `pollPortFile()` (L30-95), `waitHealth()` (L102-111), `waitExit()` (L119-131), `hardKill()` (L140-150, `taskkill /F /T` / SIGKILL). **No retry/relaunch logic exists.**
- `electron/src/http-client.js` — `probeHealth()` (never throws), `requestShutdown()` (synthesized failure response).
- `electron/src/constants.js` — all timing values centralized (probe 3000, grace 5000, poll 100/10000, health gate 5000).
- `electron/main.js` — single-instance lock (L21-27) + `second-instance` focus (L50-55); backend failure → error dialog + quit (L63-70); **unexpected child exit while window open → ERROR_DIALOG "Backend Crashed" + `app.quit()` (L111-123) — no restart**; `before-quit` → `shutdown()` (L129-143). No `Tray`, no `Notification`, no updater anywhere.
- Backend: `GET /health` (top-level, unauthenticated, `backend/app/modules/health/router.py`), `POST /api/v1/system/shutdown` (sets `should_exit`, `backend/app/main.py` L138-141), `entry.py` SIGINT/SIGTERM handlers, `backend/app/core/settings.py` exists with YAML hook (already specced `minimize_to_tray`, `port`, `backup_*`).

**Numbering mismatch (context):** `MIGRATIONPC.md` §5 calls Fase 3 "Entrega automática" (release CI); `MIGRATION_FASES.md` §8 calls Fase 3 "Ventana nativa (Electron)". Both are misleading here: the native window is DONE (fase2), and release automation is NOT (`.github/workflows/build-backend-windows.yml` L6 comment: *"never publishes a release"* — only `upload-artifact`). The USER's "Fase 3" = **real-runtime behaviors**: crash retry, update handling, tray, status notifications — i.e. the `MIGRATION_FASES.md` §3.5 new-desktop-features list (tray P0, auto-update P1, notifications P2) plus robustness. This is genuinely NEW scope, not duplication.

## Gap Analysis (the deliverable)

| Concern | Status | Evidence |
|---|---|---|
| Crash at **startup** (stale/missing `.port`, dead backend) | **ALREADY COVERED** | `lifecycle.js` `resolveBackend` L58-68: probe fails → spawn fresh; `.port` overwritten by new boot |
| Crash **mid-run** → restart with backoff | **NOT COVERED — NEW** | `main.js` L111-123: dialog + `app.quit()`. No retry, no backoff, no relaunch |
| Process cleanup on quit | **ALREADY COVERED** | `main.js` L129-143 → `lifecycle.js` `shutdown` L80-98 → `backend-process.js` `waitExit`/`hardKill` L119-150; D3 kill-only-if-spawned |
| Single-instance | **ALREADY COVERED** | `main.js` L21-27 lock; L50-55 second-instance focus. Extension: must `show()` a tray-hidden window (`focus()` on hidden window does not display it) |
| Tray icon + minimize-to-tray | **NOT COVERED — NEW (P0 §3.5)** | Zero `Tray` code in `electron/`; window close = real quit today. Also `electron/assets/` is EMPTY — icon.ico was NOT DELIVERED in fase2 (verify-report W1) |
| Auto-update | **NOT COVERED — NEW (P1 §3.5)** | No `electron-updater` dep, no `publish` config in `electron/package.json`, CI never creates releases |
| Status notifications | **NOT COVERED — NEW (P2 §3.5)** | No `Notification` usage. Renderer-side alerts would trip the fase2 frontend immutability gate (`git diff --quiet HEAD -- frontend/`) — keep in main process |
| Duplication risk | **REAL** | Any retry logic MUST reuse `resolveBackend` (probe-or-spawn + poll + health gate). A separate spawn path in `main.js` would duplicate `backend-process.js` + `lifecycle.js` |

## Affected Areas

- `electron/main.js` — crash-restart loop replacing the dialog+quit block (L111-123), tray wiring, `isQuitting` flag, `second-instance` show(), window re-target on re-spawn
- `electron/src/lifecycle.js` — expose restart orchestration (reuse `resolveBackend`; keep D3 ownership) — optional new `restart()` helper
- `electron/src/constants.js` — new constants: max restart attempts, backoff base/step, update check cadence
- `electron/package.json` — `electron-updater` dependency + `publish` (github) config; tray icon packaging
- `electron/assets/` — tray icon + window icon (currently empty; fase2 W1)
- `.github/workflows/build-backend-windows.yml` — tag/release job publishing the installer (MIGRATIONPC "Fase 3" overlap) + `GH_TOKEN` env for updater
- `backend/app/core/settings.py` — existing `config.yaml` hook already defines `minimize_to_tray`/`port` (optional read, later slice)
- `openspec/specs/electron-shell/spec.md` — future delta: crash-restart, tray, update, notification requirements (fase2 spec has neither)

## Approaches

1. **Bounded crash restart with exponential backoff (reuse `resolveBackend`)** — on unexpected child exit, if attempts < N (e.g. 3) and not shutting down: wait `1000 * 2^attempt` ms, re-run `resolveBackend` (probe-or-spawn), re-target window to the (possibly new) port, re-apply `will-navigate` allowlist; after N failures → current dialog + quit. Backend boot is idempotent (WAL + `.port` overwrite, `entry.py`).
   - Pros: self-healing in the paint shop (no user action); reuses tested orchestration; SQLite WAL makes respawn safe
   - Cons: respawn may bind a **different port** → SPA origin changes → `localStorage` (JWT) lost → user re-login; SPA state lost on reload; needs `constants.js` additions + tests
   - Effort: **Medium**
2. **Single restart then dialog** — one `resolveBackend` retry on crash; on second failure current behavior.
   - Pros: minimal code, covers transient failures (port clash, antivirus hiccup)
   - Cons: no protection against recurring crashes; still same port-change caveat
   - Effort: **Low**
3. **Status quo (dialog + quit)** — keep `main.js` L111-123 as-is.
   - Pros: zero risk; already verified
   - Cons: any production crash = dead app until user relaunches; contradicts "99.9% local availability" metric
   - Effort: **None** (default fallback)
4. **Auto-update via `electron-updater`** — add dep, `publish: {provider: github}`, NSIS `autoInstallOnAppQuit`; CI publishes installer to GitHub Releases on `v*` tags. Backend lives in `resources/backend` (inside the packaged app), so one app update atomically updates backend+frontend; `%APPDATA%` data survives.
   - Pros: native electron-builder integration, differential NSIS updates, install-on-quit avoids updating a running backend
   - Cons: needs `GH_TOKEN` secret + release automation (partially overlaps MIGRATIONPC Fase 3); unsigned exe → SmartScreen warnings (documented in MIGRATIONPC §6/§9.4); update UI strings in Spanish
   - Effort: **Medium-High**
5. **Manual update flow** (Help → check; download installer) — no `electron-updater`, just a "new version available" notification pointing at the Releases URL.
   - Pros: no new secrets/deps; simpler
   - Cons: not automatic (P1 feature says automatic); worse UX in a paint shop
   - Effort: **Low**
6. **Tray + close-to-tray (standard Electron pattern)** — `Tray` from `assets/tray-icon.png`; `close` event → `preventDefault()` + `hide()` unless `app.isQuitting`; tray menu: "Abrir TelaryColor" / "Salir" (Salir → `isQuitting = true` → `app.quit()` → existing `before-quit` shutdown path); `window-all-closed` must NOT quit while tray lives; `second-instance` gains `show()`. Needs tray/window icons (assets currently empty).
   - Pros: P0 feature from §3.5; reuses the entire verified shutdown chain as the only quit path
   - Cons: new assets required; `before-quit`/`window-all-closed` interplay must be tested (main.js is currently untestable under `node:test` — keep tray wiring thin, logic in `src/`)
   - Effort: **Medium**
7. **Main-process status notifications** — Electron `Notification`: backend started, backend restarted (attempt N), update available/installed. No renderer changes → frontend immutability gate untouched.
   - Pros: tiny surface, zero frontend risk; covers P2 §3.5 "estado" notifications
   - Cons: Windows toast requires app user model ID (set via `app.setAppUserModelId`); stock-pending alerts would need backend polling + renderer — defer
   - Effort: **Low**

## Recommendation

Scope **Fase 3 (runtime real)** as four items, all electron-side, keeping the frontend immutability gate intact:

1. **Crash resilience**: bounded restart with exponential backoff (approach 1), reusing `resolveBackend` — the highest-value gap (today a production crash kills the app).
2. **Tray + close-to-tray** (approach 6) — P0, with real quit routed through the existing `before-quit` → `shutdown()` chain.
3. **Auto-update via `electron-updater`** (approach 4) combined with a tag-driven release job in CI — this also closes MIGRATIONPC "Fase 3 — Entrega automática". Requires user decision on a `GH_TOKEN`/publish secret.
4. **Main-process status notifications** (approach 7) — small, covers backend-started/restarted/update-ready toasts.

Do NOT duplicate `lifecycle.js`/`backend-process.js`; restart = re-invocation of `resolveBackend`. Defer renderer-driven alerts (stock, muestras pendientes) — they touch `frontend/` and trip the fase2 CI gate.

## Risks

- **Port change after respawn** → SPA origin (`http://127.0.0.1:{port}`) changes → `localStorage` JWT lost → re-login. Mitigate: re-probe old port first (generic `find_free_port` will re-bind 8000 when free after crash); accept rare re-login; document.
- **Frontend immutability gate** blocks any renderer-side notification/update UI — keep Fase 3 main-process only or spec a gate exception explicitly.
- **Auto-update activation** requires publishing config, a GitHub token secret, and a release workflow; unsigned installers trigger SmartScreen (documented workaround in MIGRATIONPC, no code signing budget assumed).
- **Missing icons** — `electron/assets/` is empty (fase2 verify W1); tray + window icons must be delivered as part of this change, or the tray cannot render on Windows.
- **Window re-target after restart** — `will-navigate` allowlist is port-specific (main.js L94-99); a re-spawned backend on a new port requires re-applying it before `loadURL`.

## Ready for Proposal

**Yes.** The orchestrator should tell the user: Fase 2 already covers startup crash recovery, graceful shutdown, and single-instance. The genuine gaps for real runtime are (1) mid-run crash restart with backoff, (2) tray + close-to-tray, (3) auto-update (needs a decision: `electron-updater` vs manual, plus GitHub token), (4) status notifications. Recommend a 4-item proposal, electron-only, no frontend changes.