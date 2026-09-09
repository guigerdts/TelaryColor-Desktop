# Proposal: Fase 4 — Installer Generation & Tag Release Pipeline

## Intent

`release-desktop.yml` publishes before building the backend/frontend `extraResources` needs (`../build/entry.dist`) — a `v*` tag push fails. Fase 4 makes the tag workflow a self-contained build → package → publish pipeline, verified with a real test-tag run.

## Scope

### In Scope
- ONE consolidated tag-triggered workflow: build Nuitka backend + frontend first, then `electron-builder --publish always`; never publish without a successful build.
- `artifactName = TelaryColor-Setup-${version}.exe`; local `dist` stays `--publish never`.
- `icon.ico` regenerated multi-resolution (256×256) from `icon-512.png`; final real-logo swap user-provided.
- SmartScreen "Unknown publisher" documented as ACCEPTED limitation; no signing.
- Test-tag end-to-end gate (`v0.1.0-test`) before close.

### Out of Scope
- Code signing; Fase 5 CI/CD redesign; backend size optimization.

## Capabilities

### New Capabilities
- `release-pipeline`: tag-triggered pipeline — build Nuitka backend + frontend, stage `entry.dist`, package NSIS, publish only after both builds succeed; artifact naming; multi-res icon; test-tag gate.

### Modified Capabilities
- `electron-shell`: "Auto-Update via electron-updater" — the tag-publish scenario MUST build backend+frontend before publishing (precondition unsatisfiable); filename aligned to `TelaryColor-Setup-${version}.exe`.

## Approach

Fold `build-backend-windows.yml`'s steps (Nuitka compile → stage → smoke → frontend build) into `release-desktop.yml`, then `electron-builder --publish always` (GH_TOKEN); push workflow stays CI-only. Size (~150–250 MB): ACCEPT as-is — under the 500 MB gate; Nuitka standalone cost inherent; UPX/onefile rejected (false positives / exe-relative resources).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.github/workflows/release-desktop.yml` | Modified | Self-contained build + stage + publish |
| `.github/workflows/build-backend-windows.yml` | Modified | CI-only validation, no publish |
| `electron/package.json` | Modified | `artifactName`; `dist` → `--publish never`; `release` → `--publish always` |
| `electron/assets/icon.ico` | Modified | Regenerated 256×256 (final logo user-provided) |
| `frontend/public/icons/icon-512.png` | Read-only | Icon regeneration source |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Tag push publishes broken installer | Low | Build-first gating + layout checks + test-tag gate |
| SmartScreen "Unknown publisher" | High | Documented accepted limitation (Fase 3) |
| Nuitka failure on runner/deps | Med | Reuse proven steps + `smoke_binary.py` |
| Large installer / CI time | Med | Accepted; under plan gate |

## Rollback Plan

Git revert of workflow/`package.json`; delete the test tag or draft asset. Publication occurs only on tag push — prior releases stay intact.

## Dependencies

- `uitka-build/` compile/stage/smoke scripts, proven.

## Success Criteria

- [ ] `v0.1.0-test` tag runs end-to-end (build → package → publish) with installer asset in GitHub Releases
- [ ] Artifact named `TelaryColor-Setup-${version}.exe`
- [ ] `icon.ico` 256×256; layout checks (4) pass
- [ ] No signing step; SmartScreen caveat documented
- [ ] Installer ≤ 500 MB