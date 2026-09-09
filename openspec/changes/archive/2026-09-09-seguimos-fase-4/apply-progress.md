# Apply Progress: Fase 4 — Installer Generation & Tag Release Pipeline

## Status

- **Tasks complete**: 13/13
- **Artifact store**: openspec
- **Delivery strategy**: ask-on-risk → resolved as chained PRs (PR 1: config/icons/version; PR 2: workflow), E2E gate + publish remediation as final work units
- **Change**: `seguimos-fase-4`

## Phase Summary

| Work unit | Scope | Result |
|-----------|-------|--------|
| PR 1 — Foundation (tasks 1.1–1.3) | `scripts/derive-version.mjs` + adversarial tests, `electron/package.json` (artifactName, dist/release publish flags) | Complete |
| PR 1 — Assets (tasks 2.1–2.3) | Real icon regeneration (multi-res ICO 256×256), tray icon 1254×1254 → 32×32, assets README rewrite | Complete |
| PR 2 — Workflow (tasks 3.1–3.2) | `build-backend-windows.yml` gains `--publish never`; `release-desktop.yml` rewritten as ONE job (D2 chain, publish last) | Complete |
| Verification (tasks 4.1–4.3) | Unit tests green, workflow syntax checked, RELEASE_NOTES.md with SmartScreen limitation | Complete |
| **E2E gate (task 4.4)** | Tag `v0.1.0-test` pushed → run 34228247653 success → installer asset in GitHub Releases | **Complete** |
| **Publish remediation (task 4.5)** | Draft absorbed `--publish always` silently → published via `gh release edit --draft=false`+ post-publish non-draft assert added to workflow | **Complete** |

## Task Completion

- [x] 1.1 RED: `scripts/derive-version.test.mjs` adversarial tests (`node --test`)
- [x] 1.2 `scripts/derive-version.mjs`: ref-name → sanitized version, charset-validated
- [x] 1.3 `electron/package.json`: artifactName + `--publish never` (dist) / `--publish always` (release)
- [x] 2.1 `electron/assets/icon.ico` regenerated multi-resolution from real 256×256 frame
- [x] 2.2 `electron/assets/tray-icon.png` resized 1254×1254 → 32×32
- [x] 2.3 `electron/assets/README.md` rewritten (real-logo sources, current commands)
- [x] 3.1 `build-backend-windows.yml` packaging step gains `--publish never`
- [x] 3.2 `release-desktop.yml` rewritten as ONE job (D2 step mapping, publish last)
- [x] 4.1 `node --test scripts/derive-version.test.mjs` passes green
- [x] 4.2 Both workflows syntax-checked (actionlint)
- [x] 4.3 `RELEASE_NOTES.md` created — SmartScreen "Unknown publisher" documented as ACCEPTED limitation
- [x] 4.4 E2E: `v0.1.0-test` push → run completes; release assets contain `TelaryColor-Setup-0.1.0-test.exe`
- [x] 4.5 Post-publish hardening: `release-desktop.yml` gains "Assert release is published (not draft)" step; draft absorbed-publish bug closed; `v0.1.0-test` published non-draft

## Evidence

### Publish remediation (task 4.5) — read-only reconfirmed

| Check | Command | Result |
|-------|---------|--------|
| Release state | `gh release view v0.1.0-test --json isDraft,isPrerelease,publishedAt,url` | isDraft=false, isPrerelease=false, publishedAt=2026-09-09T00:02:25Z, url=.../releases/tag/v0.1.0-test |
| latest.yml consumable | `curl -sIL` on asset browser_download_url | HTTP 200 — electron-updater feed publicly readable |
| Installer downloadable | `curl -sIL` on `TelaryColor-Setup-0.1.0-test.exe` + `.blockmap` | HTTP 200 (109,332,096 B) + HTTP 200 (114,127 B) |
| Workflow hardening | `.github/workflows/release-desktop.yml` | Final step "Assert release is published (not draft)" fails run when `isDraft=true` or `publishedAt=null` |
| Spec | `specs/release-pipeline/spec.md` | "Published-Not-Draft Guarantee" requirement + 2 scenarios added |

### E2E gate (task 4.4) — reconfirmed read-only on close

| Check | Command | Result |
|-------|---------|--------|
| Workflow run | `gh run view 34228247653 --json status,conclusion,event,headSha` | status=completed, conclusion=success, event=push, headSha=1471139c959d289a8247d1aa5d43e20e47bfcce5, workflowName="Release Desktop" |
| Release assets | `gh release view v0.1.0-test --json tagName,name,assets` | tagName=v0.1.0-test; assets: latest.yml (366 B), TelaryColor-Setup-0.1.0-test.exe (109,332,096 B), TelaryColor-Setup-0.1.0-test.exe.blockmap (114,127 B) |

Installer size 109,332,096 B (~104 MiB) satisfies the ≤ 500 MB Installer Size Gate. Filename matches spec `Installer Artifact Naming` (v0.1.0-test → TelaryColor-Setup-0.1.0-test.exe) and is referenced by latest.yml.

### Prior-task evidence (summary)

- Unit: `node --test scripts/derive-version.test.mjs` — adversarial cases (path-traversal, whitespace, semicolon, Windows-style path) rejected; `v1.2.3` → `1.2.3` passes.
- Integration: workflow steps — Nuitka compile → stage_dist → smoke_binary staged (500 MiB gate) → derive-version → electron `npm ci` + `npm test` → electron-builder `--publish always` → 4 layout checks + installer size check + smoke `--packaged` → `gh release view` asset assert (publish last, per design decision D1).
- Delivery evidence: run 34228247653 completed with conclusion=success on the full D2 chain (above).

## Work Unit Evidence (final work unit — publish remediation, task 4.5)

| Evidence | Required value |
|----------|----------------|
| Focused test command and exact result | `gh release view v0.1.0-test --json isDraft,publishedAt` → isDraft=false, publishedAt set (exit 0); `curl -sIL` on latest.yml / installer / blockmap → HTTP 200 for all three (exit 0); `node --test scripts/derive-version.test.mjs` → 15/15 (exit 0); `cd electron && npm test` → 71/71 (exit 0) |
| Runtime harness command/scenario and exact result | N/A — no new local runtime; E2E boundary (tag push → build → package → publish → asset) already exercised by pipeline run 34228247653; remediation published the existing draft and added workflow hardening |
| Rollback boundary | `git revert` of the workflow assert step + spec/tasks/apply-progress doc edits; `gh release edit v0.1.0-test --draft=true` returns the release to draft if needed; v0.1.0-test remains a test tag until change close |

## Warnings / Risks

1. **Unsigned installer — SmartScreen "Unknown publisher"**: accepted limitation per spec `No Code Signing`, documented in `RELEASE_NOTES.md` (task 4.3). No signing certificate in scope.
2. **Draft release absorbing `--publish always` (RESOLVED)**: the v0.1.0-test release existed as a pre-existing draft; the run reported success while the publish landed in the draft. Fixed by publishing the draft (`gh release edit --draft=false`) and adding the post-publish non-draft assert so a future tag run fails explicitly instead of silently succeeding into a draft.
3. **Test tag stays in repo**: `v0.1.0-test` is the E2E gate tag; it remains in the remote until the change closes. Rollback plan (design §Migration/Rollout): delete the test tag/draft release on revert.

## Numbered Learnings (for engram capture)

1. The E2E gate satisfied the full spec scenario for the tag-triggered release pipeline on the first tag push.
2. e2e evidence for this close was produced by the pipeline itself; apply only persisted the recorded facts.
3. Asset download URL slugs marked as untagged- should be double-checked during verify to confirm release publication state.
4. A pre-existing GitHub draft release absorbs electron-builder `--publish always` uploads while the Actions run still reports success — publish state must be asserted post-publish, not assumed.
5. `gh release edit --draft=false` with all assets already uploaded publishes them instantly (no re-run needed); remedy for a draft-absorbed publish.