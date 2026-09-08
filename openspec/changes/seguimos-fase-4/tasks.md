# Tasks: Fase 4 — Installer Generation & Tag Release Pipeline

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350–430 authored (icons binary, excluded) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: config/icons/version → PR 2: workflow |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test | Runtime harness | Rollback |
|------|------|-----------|--------------|-----------------|----------|
| 1 | Version derivation + installer config + real icons (offline) | PR 1 | `node --test scripts/derive-version.test.mjs` | NSIS packaging N/A on Linux sandbox (Windows runner); icons verified via `file`/Pillow frame list | Revert `scripts/`, `electron/package.json`, `electron/assets/` — no workflow coupling |
| 2 | Consolidated tag pipeline + CI publish guard | PR 2 (base: PR 1 branch) | `actionlint` syntax check on both workflows | `v0.1.0-test` tag run; `gh release view v0.1.0-test --json assets` asserts asset | Revert both workflows; delete test tag/draft release |

## Phase 1: Foundation — version derivation & config

- [ ] 1.1 RED: write `scripts/derive-version.test.mjs` adversarial tests (`node --test`): `v1.2.3`→`1.2.3`; reject hostile test inputs — literal unit-test VALUES, not edit paths (do NOT backtick path-like test values): the string "../../x" as a path-traversal example, a value with spaces like "a b", a value with a semicolon like "x;rm", and a Windows-style path value like "C:\bad" (hostile tag → package.json injection)
- [ ] 1.2 Create `scripts/derive-version.mjs`: read github.ref_name, strip leading v, validate the ref against a strict safe pattern (must start with a letter or digit and contain only letters, digits, dots, and single hyphens; reject the slash character, the backslash character, whitespace, and consecutive dots — these are validation characters, not paths), write version to `electron/package.json`, exit non-zero on violation
- [ ] 1.3 Modify `electron/package.json`: `build.win.artifactName` = `TelaryColor-Setup-${version}.${ext}`; `dist` → `--publish never`; add `release` → `--publish always`

## Phase 2: Real icons & assets (user-delivered)

- [ ] 2.1 Verify `electron/assets/icon.ico` (256×256 frame, 30,017 B) then regenerate multi-resolution ICO (16/24/32/48/64/128/256) from the real 256×256 frame (electron-icon-maker from extracted PNG, or Pillow); keep artifact at `electron/assets/icon.ico`
- [ ] 2.2 Resize `electron/assets/tray-icon.png` 1254×1254 (912 KB) → 32×32, a few KB (ImageMagick or Pillow); keep artifact at `electron/assets/tray-icon.png`
- [ ] 2.3 Rewrite `electron/assets/README.md`: both files delivered (real logo), remove stale `frontend/public/icon-512.png` references, document current regeneration/resize commands

## Phase 3: Consolidated release workflow

- [ ] 3.1 Modify `.github/workflows/build-backend-windows.yml`: electron-builder step gains `--publish never` (CI stays publish-free)
- [ ] 3.2 Rewrite `.github/workflows/release-desktop.yml` as ONE job, step order (D1): pip deps + cp313 wheel-verify (open question resolved: keep), `python uitka-build/compile.py --output-dir build`, frontend `npm ci` + `npm run build`, `python uitka-build/stage_dist.py --exe build/entry.dist/telarycolor-server.exe`, `smoke_binary.py` staged `--max-size-mb 500`, `node scripts/derive-version.mjs ${{ github.ref_name }}`, electron `npm ci` + `npm test`, `npx electron-builder --win --x64 --publish always` (`GH_TOKEN`), 4 layout checks, installer ≤500 MB check, `smoke_binary.py --packaged`, `gh release view` asset assert — publish MUST be the last step

## Phase 4: Verification & E2E gate

- [ ] 4.1 `node --test scripts/derive-version.test.mjs` passes green
- [ ] 4.2 Syntax-check both workflows (`actionlint` or equivalent)
- [ ] 4.3 Create `RELEASE_NOTES.md`: SmartScreen "Unknown publisher" documented as ACCEPTED limitation, no signing
- [ ] 4.4 E2E: push `v0.1.0-test` → run completes; `gh release view v0.1.0-test --json assets` contains `TelaryColor-Setup-0.1.0-test.exe`