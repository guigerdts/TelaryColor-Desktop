# Proposal: Fase 2 — Electron Shell Integration

## Classification

- **Type**: feature (Electron shell + backend shutdown endpoint)
- **Outcome**: backend lifecycle by Electron; zero frontend changes

## Intent

Wrap Fase 1 backend binary + SPA in an Electron shell: spawn backend, discover port, load `http://127.0.0.1:{port}`, graceful shutdown — fixing the draft's broken packaging + regex.

## Scope

### In Scope

- `POST /api/v1/system/shutdown` (loopback-only, unauthenticated like `/health`, `server.should_exit=True`, pre-catch-all)
- Electron shell: `main.js`, `preload.js`, `package.json`
- Lifecycle: reuse probe → spawn (`windowsHide`) → `.port` poll → `/health` gate → shutdown → `taskkill /F /T` (WAL = safety net)
- Packaging: staged `entry.dist/` → `resources/backend/` verbatim; thin ASAR
- Path derivation mirroring `%APPDATA%/TelaryColor`

### Out of Scope

- Frontend changes (ZERO; `file://` rejected: breaks `/api`, `/uploads`, localStorage)
- System tray, auto-update, backups (Fase 3)
- Backend logic/module changes

## Capabilities

### New Capabilities

- `electron-shell`: spawn, port discovery, window, shutdown orchestration, packaging

### Modified Capabilities

- `portable-startup`: + shutdown (endpoint → `should_exit`); + reuse-alive probe

## Approach

- Probe `.port` + `/health` → reuse live backend; else spawn `detached:false` + `windowsHide:true`
- Poll `.port`, not stdout regex (`PORT:<port>`, draft's `/port (\d+)/` wrong); `/health` gate pre-`loadURL`
- Shutdown: endpoint → ≤5s → `taskkill /F /T`; single-instance lock
- extraResources FileSet: CI-validated `entry.dist/` → `resources/backend/`; ASAR = main.js + preload.js only
- Electron main tested via node:test

## Affected Areas

| Area | Impact |
|---|---|
| `electron/{main.js,preload.js,package.json}` | New |
| `backend/app/main.py` + shutdown tests | Modified |
| `.github/workflows/build-backend-windows.yml` | Modified (+builder step) |
| `MIGRATION_FASES.md` | Modified (§7–8 corrections) |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Double backend → SQLITE_BUSY | probe; single-instance lock |
| Stdout regex mismatch | `.port` file contract; stdout secondary |
| Draft layout breaks bundle | package `entry.dist/` verbatim |
| Path drift | same on Windows; centralize; dev `backend/data` |
| Console flash | `windowsHide: true` |
| Electron main untested | node:test + CI smoke extension |

## Rollback Plan

Remove `electron/` + CI step; revert shutdown route. Data untouched (WAL).

## Dependencies

- Fase 1 artifact: staged `entry.dist/` + smoke contract
- electron, electron-builder (npm)

## Success Criteria

- [ ] Window `http://127.0.0.1:{port}` < 3s; offline login
- [ ] 2nd launch reuses backend
- [ ] shutdown grace-stops; `/F` only post-timeout
- [ ] Packaged: SPA, `/uploads`, localStorage, migrations
- [ ] `git diff frontend/` empty
- [ ] node:test green in CI

## Cost / Impact

- New (~7): `electron/*` + electron tests + shutdown tests
- Modified: `backend/app/main.py`, CI workflow, `MIGRATION_FASES.md`
- Untouched: frontend + boot-chain files

## Open Questions

None — scope confirmed. Endpoint loopback-only, same trust as `/health`.