# Design: Fase 2 — Electron Shell Integration

## Technical Approach

Electron main process (composition root) drives a probe-or-spawn backend lifecycle: acquire the single-instance lock, probe `.port` + `/health` for a live backend and reuse it, otherwise spawn the Nuitka exe (`windowsHide`, `detached: false`), poll `.port`, health-gate, load `http://127.0.0.1:{port}` in a locked-down BrowserWindow, and on quit call `POST /api/v1/system/shutdown` with `taskkill /F /T` only after the grace window. All testable logic lives in electron-free `src/` modules (spec: Main-Process Tests); `main.js` only wires Electron APIs. Backend delta: shutdown endpoint sets `server.should_exit` (spec portable-startup). One `extraResources` FileSet maps the CI-staged `entry.dist/` verbatim into `resources/backend/`. Zero frontend changes.

## Architecture Decisions

| # | Decision | Options considered | Choice / Rationale |
|---|---|---|---|
| D1 | **Shutdown endpoint reaches uvicorn** | (a) `os._exit`; (b) raise `KeyboardInterrupt` in handler; (c) `os.kill(self, SIGINT)` | (c→no) task exceptions never reach `serve()`; (a→no) no drain. **Chosen:** explicit `uvicorn.Config`+`uvicorn.Server` in `entry.py`, stored as `app.state.server` before `server.run()` (uvicorn 0.52.4 keeps `should_exit` on the instance; `uvicorn.run()` hides it). Freezer-safe: still passes the app OBJECT. Requires a small `entry.py` change + `test_entry.py` wrapper updates (mock `uvicorn.Config`/`Server` instead of `run`). |
| D2 | **Lock gates probe** | Probe before lock; lock before probe | **Chosen: lock FIRST.** `requestSingleInstanceLock()` is synchronous and atomic at startup; the second instance quits immediately and NEVER reaches probe/spawn. Probe only runs in the lock-holding instance — no race, no duplicated anti-double-backend logic (lock = process gate; probe = backend-reuse gate). |
| D3 | **Backend ownership rule** | Always kill on quit; kill only if spawned | **Chosen: kill only if WE spawned it.** A reused backend predates us and another owner may manage it. Reuse → leave running on quit; spawn → graceful shutdown + `/F` fallback. |
| D4 | **Testable module split** | Monolithic `main.js`; `src/` modules | **Chosen: `src/` modules** (constants, paths, http client, process, lifecycle). `main.js` cannot be imported under `node:test` (requires `electron`); spec mandates green main-process tests in CI. |
| D5 | **Timing constants centralized** | Inline literals; `src/constants.js` | **Chosen: single `src/constants.js`** (spec `BACKEND_PROBE_TIMEOUT_MS`, `SHUTDOWN_GRACE_TIMEOUT_MS`=5000 + cadence). No literal timeouts in `main.js`. |
| D6 | **Dev mode** | Vite-only `dev.js` bypassing the shell; same shell with dev paths | **Chosen: same shell.** Dev derives `backend/data` and spawns `backend/entry.py` via the venv python; the tested orchestration is the one shipped. |
| D7 | **Packaging layout** | Draft's per-item entries (renamed `frontend`, missing `alembic.ini`); one FileSet | **Chosen: ONE FileSet** `{from: ../build/entry.dist, to: backend}` — verbatim copy, nothing reconstructed. Draft layout breaks `static_dir()` and `migrations_dir()` (SPA 404 + fatal migration). |

## Module Structure

```
electron/
├── main.js            # composition root: lock → lifecycle → window → quit — Electron APIs only
├── preload.js         # contextBridge: version/platform/isElectron (read-only)
├── package.json       # main, scripts (start/test/dist), electron-builder build block
├── assets/icon.ico    # created from frontend PWA icon (win.icon)
├── src/
│   ├── constants.js   # D5 — all timing values
│   ├── paths.js       # backendExePath(), dataDir(), portFile() — packaged vs dev
│   ├── http-client.js # probeHealth(port), requestShutdown(port) — Node 20 global fetch
│   ├── backend-process.js # spawnBackend(), pollPortFile(), waitHealth(), waitExit(), hardKill()
│   └── lifecycle.js   # resolveBackend() = probe-or-spawn→discover→gate; shutdown(owner, port)
└── test/              # node:test (node --test test/) — no Electron runtime needed
```

## Centralized Constants (`electron/src/constants.js`)

```js
module.exports = Object.freeze({
  BACKEND_PROBE_TIMEOUT_MS: 3000,   // reuse probe: /health must answer within this (spec named); 3000 chosen over 2000 — CI smoke measured ~1.6s cold-start after kill/relaunch, office PCs slower
  SHUTDOWN_GRACE_TIMEOUT_MS: 5000,  // spec-mandated value: wait for exit before taskkill /F /T
  PORT_POLL_INTERVAL_MS: 100,       // .port poll cadence
  PORT_POLL_TIMEOUT_MS: 10000,      // spawn → .port write deadline
  HEALTH_GATE_TIMEOUT_MS: 5000,     // /health readiness gate before loadURL
})
```
Consumers: `http-client.js` (probe timeout), `backend-process.js` (polls, gate), `lifecycle.js` (grace time), `test/*` (asserts the contract, injects shorter timeouts for speed).

## Main-Process Lifecycle State Machine

```
INIT → acquire lock ──false──▶ QUIT (2nd instance; 1st 'second-instance'→focus)
        │ true
        ▼
      PROBE (.port read + GET /health ≤ BACKEND_PROBE_TIMEOUT_MS)
        ├─ healthy ──────────────▶ WINDOW (loadURL http://127.0.0.1:{port})
        └─ dead/missing ─────────▶ SPAWN (windowsHide:true, detached:false)
                                   ├─ spawn error → ERROR_DIALOG → QUIT
                                   ├─ early child exit → ERROR_DIALOG → QUIT
                                   └─ POLL .port (≤ PORT_POLL_TIMEOUT_MS)
                                      ├─ timeout → KILL child → ERROR_DIALOG → QUIT
                                      └─ port → HEALTH GATE (≤ HEALTH_GATE_TIMEOUT_MS)
                                         ├─ timeout → KILL child → ERROR_DIALOG → QUIT
                                         └─ 200 → WINDOW
                                                └─ quit → SHUTDOWN (owned child only):
                                                    POST shutdown → wait exit ≤ 5000ms
                                                    ├─ exited in grace → EXIT
                                                    └─ timeout → taskkill /F /T /PID → EXIT
Unexpected child exit while window open → ERROR_DIALOG + QUIT (WAL-safe).
```

### Lock + Probe Sequence (D2 — no race)

```
Instance B (2nd launch)            Instance A (lock holder)
  requestSingleInstanceLock()→false          requestSingleInstanceLock()→true
  (no probe, no spawn, no paths)             ◀── 'second-instance' → focus window
  app.quit()                                     read .port → GET /health ≤ 2000ms
                                                 ├─ 200 → REUSE (no spawn)
                                                 └─ dead → SPAWN fresh backend (overwrites .port)
```

## electron-builder (`electron/package.json`)

```jsonc
"files": ["main.js", "preload.js", "src/**/*", "package.json"],  // ASAR = main-process JS ONLY
"extraResources": [{ "from": "../build/entry.dist", "to": "backend" }],
"win": { "target": [{ "target": "nsis", "arch": ["x64"] }], "icon": "assets/icon.ico" },
"nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true,
          "createDesktopShortcut": true, "createStartMenuShortcut": true,
          "shortcutName": "TelaryColor" },
"asar": true, "npmRebuild": false
```
Resulting packaged layout (CI-validated shape, verbatim):

```
win-unpacked/
├── TelaryColor.exe
└── resources/
    ├── app.asar                    # main.js + preload.js + src/** (code only)
    └── backend/                    # entry.dist/ copied VERBATIM (one FileSet)
        ├── telarycolor-server.exe
        ├── alembic/  alembic.ini   # migrations_dir() + ini at resources/backend
        └── frontend/dist/          # static_dir() = resources/backend/frontend/dist
```
MUST NOT reintroduce draft mappings (`frontend/dist`→`resources/frontend`, omitted `alembic.ini`).

## CI Workflow Changes (`build-backend-windows.yml`)

| # | Step | Change | Placement rationale |
|---|---|---|---|
| 1 | Checkout | Modify: `fetch-depth: 0` | base ref available for the immutability gate |
| 2 | **Fail fast: frontend touched** | NEW, bash: `git diff --quiet HEAD -- frontend/` → `::error::` + exit 1 | FIRST step after checkout, BEFORE Python setup, Nuitka build, any build — cheap (`git diff`), zero deps |
| 3 | **Fail fast vs base (push)** | NEW, bash: `git diff --quiet "${{ github.event.before }}" HEAD -- frontend/` (`if: github.event_name == 'push'`) | makes spec Scenario C enforceable on push (step 2 catches dirty worktree/reruns) |
| 4 | Setup Python + install deps + wheel check | unchanged | — |
| 5 | Nuitka build | unchanged | gate above already failed fast |
| 6 | Frontend build | unchanged | — |
| 6b | **Post-build dist drift check** | NEW: `git diff --quiet HEAD -- frontend/dist` after build | catches committed-but-stale dist |
| 7 | Stage distributable | unchanged | `build/entry.dist` |
| 8 | Smoke test staged binary | unchanged | — |
| 9 | **Electron deps** | NEW: `npm ci` (working-directory `electron/`) | before tests/packaging |
| 10 | **Electron main-process tests** | NEW: `npm test` (`node --test test/`) | spec gate, green before spendy packaging |
| 11 | **Package desktop app** | NEW: `npx electron-builder --win --x64` (working-directory `electron/`) | outputs `dist/win-unpacked/` + `dist/TelaryColor-Setup-*.exe` |
| 12 | **Verify packaged layout** | NEW: assert `resources/backend/{telarycolor-server.exe, alembic/versions, alembic.ini, frontend/dist/index.html}` exist | proves CI-validated layout survived packaging |
| 13 | Upload backend artifact | unchanged | — |
| 14 | **Upload desktop artifact** | NEW: win-unpacked + installer, `if-no-files-found: error` | — |

Workflow trigger `paths:` also gains `electron/**`.

## Data Path Strategy

Packaged: `path.join(app.getPath('appData'), 'TelaryColor', 'data')` — on Windows `app.getPath('appData') === %APPDATA%`, byte-identical to backend `app_data_dir()` (env override `TELARYCOLOR_DATA_DIR` respected by backend; Electron never sets it). Dev: `path.join(repoRoot, 'backend', 'data')` mirrors `backend/data`. `.port` lives at `dataDir/.port` in both. Derivation lives only in `src/paths.js`.

## Interfaces / Contracts

```js
// src/lifecycle.js
resolveBackend({ exePath, dataDir, portFile, isPackaged })
  → Promise<{ mode: 'reused'|'spawned', child: ChildProcess|null, port: number }>
shutdown({ mode, child, port })  // reused → no-op; spawned → POST shutdown → waitExit(SHUTDOWN_GRACE_TIMEOUT_MS) → hardKill()
```
Backend contract (portable-startup delta): `POST /api/v1/system/shutdown` → `app.state.server.should_exit = True` (uvicorn drains). Registered after `health_router`, before `_UploadsRoute`/`_mount_spa` in `create_app()`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (node:test, `test/`) | constants, paths | assert spec values (5000, probe); pure `deriveDataDir(appData, isPackaged)` |
| Unit (node:test) | http-client | local `http.createServer` stub: /health 200→healthy, never-answering→dead within probe timeout; shutdown POST asserts method+path |
| Integration (node:test) | backend-process | spawn real `node -e` fake backend that writes `.port` + serves /health; poll finds port; ENOENT→error; early exit→error |
| Integration (node:test) | lifecycle/shutdown | fake child (EventEmitter 'exit'): exit within grace→no kill; timeout→`taskkill /F /T /PID` invoked (Windows branch exercised on windows-latest runner) |
| Backend (pytest) | shutdown endpoint | route exists before SPA route; sets `should_exit` on fake `app.state.server`; 200 without state |
| E2E (CI) | Scenario A/B/C + layout | existing smoke + new layout assert; frontend-touch commit must fail (Scenario C) |

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A — no doc-as-executable handling | — | — |
| Git repository selection | Applicable — CI gate runs `git diff` in the checkout | Step 2/3 fail before any build; literal pathspec `-- frontend/`; `fetch-depth: 0` | CI run of a commit touching `frontend/` (Scenario C) |
| Commit state | N/A — no index/commit operations | — | — |
| Push state | N/A — no push automation | — | — |
| PR commands | N/A — no PR automation | — | — |
| Subprocess spawn (backend) | Applicable | `spawn(exe, [], {detached:false, windowsHide:true})`, list args only; missing exe → dialog+quit | SPAWN error / early-exit tests |
| Process kill (shutdown) | Applicable | graceful endpoint first; `taskkill /F /T /PID` only after 5000 ms; never touch unowned process | grace-exit→no-kill; timeout→taskkill invoked; reuse→no kill |

## Security

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, minimal preload bridge; `will-navigate`/`setWindowOpenHandler` deny any origin other than `127.0.0.1:{port}`; backend bound to 127.0.0.1 (loopback only, same trust as `/health`); window `show:false` until `ready-to-show`, `backgroundColor:'#0f172a'`.

## Migration / Rollout

No data migration. Drop-in: dev/backends unaffected until the Electron shell owns the spawn; old `backend/entry.py` standalone operation still valid. WAL recovery remains the documented safety net. Rollback: remove `electron/` + CI steps + shutdown route (proposal rollback plan).

## Open Questions

- None blocking. (BACKEND_PROBE_TIMEOUT_MS resolved: 3000 ms — user-approved; 2000 left too little margin given ~1.6s CI smoke cold-start measurement.)