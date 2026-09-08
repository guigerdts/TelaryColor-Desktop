# Design: Fase 4 — Installer Generation & Tag Release Pipeline

## Technical Approach

Convert `.github/workflows/release-desktop.yml` from a broken publish-first stub into a self-contained, tag-triggered build → package → publish pipeline. It REUSES the proven Nuitka chain from `build-backend-windows.yml` (`compile.py` → `stage_dist.py` → `smoke_binary.py`) and the frontend build verbatim — same scripts, same invocation parameters, same runner — changing only the FINAL DESTINATION (GitHub Releases via `--publish always` instead of CI artifacts). The installer version derives from the git tag, `artifactName` pins `TelaryColor-Setup-${version}.exe`, and `icon.ico` is regenerated at 256×256. Close is gated by an end-to-end `v0.1.0-test` run.

## Architecture Decisions

| # | Decision | Options (tradeoffs) | Decision |
|---|----------|--------------------|----------|
| D1 | Build→publish ordering | (a) two jobs + `needs` (explicit but disjoint semantics; publish could drift) · (b) one job, sequential steps (implicit order, no `continue-on-error`, publish is last) | **(b)** One job, steps in order; any build/stage/smoke failure aborts before `electron-builder` runs, satisfying the never-publish-without-build guarantee |
| D2 | Backend/frontend chain | (a) rewrite steps in release workflow · (b) **reuse CI chain verbatim** (proven, spec `release-pipeline` §Consolidated workflow) | **(b)** Step mapping below — same scripts, same flags, same inputs |
| D3 | Installer version source | (a) manual version-bump commits before tagging (two sources of truth) · (b) derive from tag at build time (tag is the single source) | **(b)** New `scripts/derive-version.mjs` reads `github.ref_name`, strips leading `v`, validates charset, writes `electron/package.json` version before packaging |
| D4 | Version channel consistency | `${env.X}` macro in `artifactName` (filename only; `latest.yml` still uses package version → mismatch) vs. tag-derived package version (filename AND `latest.yml` agree) | Tag-derived version: app + feed + filename all report the same version; `electron-updater` compares consistently |
| D5 | Icon regeneration | `electron-icon-maker` (already documented in `assets/README.md`; one command yields ICO + PNG for tray/window) · `png-to-ico` (ICO only) · ImageMagick (absent on runners) | **electron-icon-maker**, one-off at apply time, artifacts committed (deterministic; final logo swap user-provided). Input `frontend/public/icons/icon-512.png` (README's `frontend/public/icon-512.png` path is stale — fix docs) |
| D6 | Code signing | Sign (≈$200/yr cert) vs. document | **No signing**; SmartScreen "Unknown publisher" documented in release notes (spec `electron-shell` §Auto-Update, `release-pipeline` §No Code Signing) |
| D7 | Smoke size gate | `smoke_binary.py` defaults `--max-size-mb 200` — contradicts accepted 150–250 MB backend | Release smoke passes `--max-size-mb 500` (matches spec §Installer Size Gate ≤ 500 MB); post-package step asserts installer ≤ 500 MB |

### D2 — Step reuse mapping (CONFIRMED DIRECTIVE)

| Release-pipeline step | Source (proven) | Same invocation |
|---|---|---|
| Setup Python 3.13 + pip cache | `build-backend-windows.yml` | same (`cache-dependency-path` both requirements files) |
| `pip install -r requirements.txt` / `requirements-build.txt` | same | same |
| Nuitka compile | `python uitka-build/compile.py --output-dir build` | identical, incl. `--windows-console-mode=disable`, package/module includes, `--nofollow-import-to` |
| Frontend build | `setup-node@v4` node 20 + `npm ci` + `npm run build` (frontend/) | identical |
| Stage distributable | `python uitka-build/stage_dist.py --exe build/entry.dist/telarycolor-server.exe` | identical (stages `alembic/`, `alembic.ini`, `frontend/dist` beside exe) |
| Smoke staged binary | `python uitka-build/smoke_binary.py --exe … --staged-dir build/entry.dist` | identical except `--max-size-mb 500` (D7) |
| Electron deps + `npm test` | same | same |
| Package | `npx electron-builder --win --x64` | **same build**; adds `--publish always` + `GH_TOKEN` |
| Verify packaged layout | `build-backend-windows.yml` bash block | identical (4 checks: `resources/backend/`, `alembic.ini`, `frontend/dist/index.html`, exe) |
| Smoke packaged (`--packaged`) | same | identical |
| Delivery | CI: `upload-artifact` | **REPLACED** by GitHub Releases publish (`--publish always`) + asset-presence check. Nothing else changes |

CI-only fail-fast guards (frontend/ must not change) are intentionally NOT copied: the release workflow builds the frontend by design.

## Data Flow

```
v* tag push
  └─ release-desktop.yml (windows-latest, permissions: contents: write)
       ├─ checkout
       ├─ python 3.13 + runtime/build deps
       ├─ compile.py --output-dir build        → build/entry.dist/ (telarycolor-server.exe)
       ├─ npm ci + npm run build (frontend/)   → frontend/dist/
       ├─ stage_dist.py --exe build/entry.dist/…  → + alembic/, alembic.ini, frontend/dist
       ├─ smoke_binary.py (staged, 500 MiB gate)
       ├─ derive-version.mjs (${{ github.ref_name }}) → electron/package.json version
       ├─ npm ci + npm test (electron/)
       ├─ electron-builder --win --x64 --publish always (GH_TOKEN)
       │    └─ electron/dist/TelaryColor-Setup-<ver>.exe + latest.yml  → GitHub Releases
       ├─ layout checks (4) + installer ≤ 500 MB
       ├─ smoke_binary.py --packaged
       └─ gh release view — assert installer asset attached to the tag
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `.github/workflows/release-desktop.yml` | Modify | Full D2 chain + derive-version + publish + verification steps |
| `.github/workflows/build-backend-windows.yml` | Modify | Packaging step gains explicit `--publish never` (CI stays publish-free, spec §Build-Before-Publish) |
| `electron/package.json` | Modify | `build.win.artifactName`; `dist` → `--publish never`; add `release` → `--publish always` |
| `scripts/derive-version.mjs` | Create | Tag → sanitized semver-ish version; node, no shell interpolation |
| `scripts/derive-version.test.mjs` | Create | Adversarial tag-name unit tests (`node --test`) |
| `electron/assets/icon.ico`, `tray-icon.png` | Regenerate | 256×256 multi-res from `frontend/public/icons/icon-512.png` |
| `electron/assets/README.md` | Modify | Correct source path + exact generation command |
| `frontend/public/icons/icon-512.png` | Read-only | Icon source |

## Interfaces / Contracts

```jsonc
// electron/package.json (delta)
"scripts": { "dist": "electron-builder --win --x64 --publish never",
             "release": "electron-builder --win --x64 --publish always" },
"build": { "win": { "icon": "assets/icon.ico",
                    "artifactName": "TelaryColor-Setup-${version}.${ext}" },
           "publish": { "provider": "github", "owner": "guigerdts", "repo": "TelaryColor-Desktop" } }
```
- `derive-version.mjs`: input `ref_name` → output version; strip leading `v`, require `/^[A-Za-z0-9][A-Za-z0-9.\-]*$/`; reject `/`, `\`, whitespace, `..`. Exit non-zero on violation (workflow fails before packaging).
- Publish env: `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` (already wired; `contents: write` permission already present).

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `derive-version` sanitization | `node --test`: `v1.2.3`→`1.2.3`; reject `../../x`, `a b`, `x;rm`, `C:\bad` |
| Integration | Packaged layout + installer size | Workflow bash checks (4 layout checks, exe ≤ 500 MB) |
| Integration | Binary validity | `smoke_binary.py` staged + `--packaged` modes |
| E2E | Tag → Releases asset | `v0.1.0-test` full run + `gh release view` asset assertion |

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A — all commands are static workflow steps or list-arg `shell=False` subprocess calls in proven scripts; no executable-doc boundary | — | — |
| Git repository selection | **Applicable** — tag name (`github.ref_name`) flows into `derive-version.mjs`; hostile tag could inject into `package.json` | node script, no shell, charset-validated version | `derive-version.test.mjs` adversarial inputs (above) |
| Commit state | N/A — pipeline performs no git commits | — | — |
| Push state | N/A — pipeline never pushes; tag push is the trigger only | — | — |
| PR commands | N/A — no PR creation/composition | — | — |

## Migration / Rollout

No data migration. Rollout: (1) apply icon regeneration + `package.json`/script changes; (2) push **test tag** `v0.1.0-test` — version derives from the tag (no bump needed) — full build→package→publish must complete with asset in Releases; (3) verify asset/download, then close. Rollback: `git revert` workflows/`package.json`; delete the test tag/draft release asset. Publication only occurs on tag push; prior releases untouched.

## Open Questions

- [ ] Keep the cp313 wheel-verify step in the release workflow? (recommended: yes — cheap guard against runner drift; confirm at tasks)