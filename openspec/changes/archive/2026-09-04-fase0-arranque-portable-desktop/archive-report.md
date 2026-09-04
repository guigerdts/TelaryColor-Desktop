# Archive Report: Fase 0 — Portable Startup for Desktop

```yaml
change: fase0-arranque-portable-desktop
archived: "2026-09-04"
archived_to: openspec/changes/archive/2026-09-04-fase0-arranque-portable-desktop/
artifact_store: openspec
verdict: pass
requirements: 7/7
scenarios: 18/18
critical_findings: 0
blockers: 0
```

## Verdict at Close

The change closed with **PASS**: all 7 requirements implemented and verified, all 18 spec scenarios compliant on the aligned texts, zero CRITICAL findings, zero blockers, zero failing tests.

- Evidence revision: `sha256:1f9ef0df53ed0bfb06f2e499a73d1207d0ec5cfc5925862e1db2780da13833c4` (verify-report, re-verification run).
- Verification was a **re-verification** performed after maintainer-authorized spec alignment and cleanup (see Final-State Facts below); the verdict recorded at that run remains the state at close.

## Final-State Facts (at close)

These facts were forwarded by the orchestrator at archive launch as the most recent account of the change, and outrank intermediate snapshots:

1. **Spec alignment (maintainer-authorized)** — two scenario texts in `specs/portable-startup/spec.md` were aligned to match `design.md` and delivered behavior:
   - "Static dir frozen falls back": `static_dir()` returns `<exe>/frontend/dist` and the SPA mount is skipped gracefully (no app breakage) — matches the `_mount_spa` `is_dir()` guard.
   - "Port file written": `.port` is written at `<app_data_dir>/.port` (not the app base dir) — matches design data-flow and `write_port_file()`.
   - Re-verification passed 18/18 on the aligned texts.
2. **Stray DB removed** — `backend/data/telarycolor.db` (orphan from the corrected `db_path` defect, which resolves to `app.db`) was deleted and confirmed absent. `backend/data/` now contains only `app.db` and `uploads/`.
3. **tasks.md** — 19/19 tasks complete (17 SDD tasks + 2 ledger meta entries counted by the dispatcher). Tasks 2.3/2.4 carry a resolution note: portable uploads were achieved functionally-equivalently via `config.py`'s `upload_dir = str(uploads_dir())` (the literal call-site edit in `uploads.py`/`router.py` was not performed); `test_config` asserts `upload_dir == str(uploads_dir())`. Accepted at verify as functionally equivalent — no spec broken.
4. **Test results at close** — targeted Fase 0 suite 26/26 passed; full backend suite 234 passed, 1 deselected (`tests/test_inventory.py::test_downgrade` — pre-existing, NOT caused by Fase 0; `tests/test_inventory.py` unmodified by this change).
5. **Attempt ledger** — `sdd-attempt` reset performed with maintainer authorization; attempt outcome `passed` recorded; no outstanding acquire tokens.

## Artifacts Read (traceability)

- `openspec/changes/fase0-arranque-portable-desktop/proposal.md`
- `openspec/changes/fase0-arranque-portable-desktop/specs/base/spec.md` (delta)
- `openspec/changes/fase0-arranque-portable-desktop/specs/portable-startup/spec.md` (delta)
- `openspec/changes/fase0-arranque-portable-desktop/design.md`
- `openspec/changes/fase0-arranque-portable-desktop/tasks.md`
- `openspec/changes/fase0-arranque-portable-desktop/verify-report.md`

## Artifacts Archived

All artifacts moved mechanically (`git mv` attempted → plain `mv` fallback, untracked folder) with recursive pre-move snapshot and mandatory empty `diff -r` readback:

```
openspec/changes/archive/2026-09-04-fase0-arranque-portable-desktop/
├── proposal.md
├── exploration.md
├── specs/
│   ├── base/spec.md
│   └── portable-startup/spec.md
├── design.md
├── tasks.md          (19/19 complete, 0 unchecked)
└── verify-report.md
```

The `archive-report.md` file is additive-only and was written after the readback.

## Source of Truth Synced (main specs)

| Domain | Action | Details |
|--------|--------|---------|
| `portable-startup` | Created | New capability spec copied mechanically to `openspec/specs/portable-startup/spec.md` — 6 requirements (Portable Path Resolution, Dev vs Frozen Data Location, Dynamic Port Selection, Port Discovery Contract, Entry Boot Chain, Optional YAML Configuration), 14 scenarios. Empty `diff -r` against the delta. |
| `base` | Updated (MODIFIED) | "Application Entry Point" requirement replaced with the delta's full block: now mandates boot via `python -m uvicorn app.main:app` OR `entry.py`, `static_dir()` for the SPA mount, and a `__main__` dynamic-port block. 4 scenarios (Boot from venv preserved; Boot from entry.py, SPA served from portable path, `__main__` dynamic port added). All other base requirements preserved untouched. |

No REMOVED or RENAMED deltas existed; no destructive merge, so no archive warning was required (`rules.archive` from `openspec/config.yaml`).

## Resolutions Carried from Verification

Per `verify-report` (intermediate snapshot, verification-time):

- **CRITICAL**: none at any point.
- **WARNINGS**: all four prior-report warnings resolved or accepted at the re-verification: WARNING-1 (tasks 2.3/2.4 call-site edit) resolved/accepted via the resolution note in tasks.md; WARNING-2 (frozen static fallback scenario text) closed by alignment; WARNING-3 (`.port` location scenario text) closed by alignment to `<app_data_dir>/.port`; WARNING-4 (TDD evidence form) accepted as a protocol-form gap with RED/GREEN evidence recovered and re-verified.
- **SUGGESTIONS** (open, non-blocking): raise the `test_entry.py` wrapper subprocess timeout from 15s to 30s; optional negative test for "no auto-open browser" and signal-handler registration; Fase 1 Electron must read `app_data_dir()/.port`.

## SDD Cycle Status

The cycle is **complete**: proposed → speced → designed → tasked → applied → verified → archived. The change is closed; the audit trail is immutable.

## Next Steps

- Commit and push the archived change folder, the synced main specs, and the implementation (ordinary repository policy; explicitly out of scope for this phase).
- Fase 1+ (Electron shell) reads the `.port` discovery contract (`<app_data_dir>/.port` + `PORT:<port>` stdout).