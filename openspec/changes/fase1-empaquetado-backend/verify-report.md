```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:f3a2f8c558835cdeccaa0d5a07068bda8cc09e51534d0102956799981843650f
verdict: fail
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 20/24
test_command: cd backend && .venv/bin/python -m pytest tests/test_paths.py tests/test_entry.py tests/test_health.py -q
test_exit_code: 0
test_output_hash: sha256:f3b3727d57cb157fdb6226c148c0c7e8e0e33cdee523c172879163495c57a95f
build_command: backend/.venv/bin/python -m py_compile uitka-build/compile.py uitka-build/compile_pyinstaller.py uitka-build/stage_dist.py uitka-build/smoke_binary.py && backend/.venv/bin/python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-backend-windows.yml'))"
build_exit_code: 0
build_output_hash: sha256:f224599db54a782a915b3ca8425e396094c5b4ac432373feadc7313d36e31a98
```

## Verification Report

**Change**: fase1-empaquetado-backend
**Version**: N/A (delta specs, initial archive)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 19 |
| Tasks complete | 18 |
| Tasks incomplete | 1 (4.2 remaining sub-item after cleanup — see WARNING) |

### Build & Tests Execution
**Build**: ✅ Passed
```text
$ backend/.venv/bin/python -m py_compile uitka-build/compile.py uitka-build/compile_pyinstaller.py uitka-build/stage_dist.py uitka-build/smoke_binary.py
→ exit 0 (all 4 scripts compile)
$ backend/.venv/bin/python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-backend-windows.yml'))"
→ exit 0 (YAML OK, job build-windows)
$ bash uitka-build/test_binary.sh --help  → exit 0 (smoke harness operational)
$ backend/.venv/bin/python uitka-build/compile.py --help → exit 0
```

**Tests**: ✅ 27 passed / ❌ 0 failed / 0 skipped (focused suite, the verifying command for this change)
```text
$ cd backend && .venv/bin/python -m pytest tests/test_paths.py tests/test_entry.py tests/test_health.py -q
27 passed in ~5s — exit 0
  test_paths.py .............. 18 passed  (frozen/dev path matrix, Nuitka __compiled__ detection,
                                            app_base_dir/app_data_dir/migrations_dir/static_dir frozen+dev)
  test_entry.py ....... 7 passed          (boot chain, in-process alembic, absolute paths, no-subprocess,
                                            idempotent migration, app OBJECT passed to uvicorn)
  test_health.py .. 2 passed              (GET /health → 200 application/json, no auth)
```

**Full suite**: 244 passed + 1 failed (exit 1) — the single failure is `test_inventory.py::test_downgrade_drops_only_new_inventory_tables`
(alembic 0004 constraint KeyError), a KNOWN PRE-EXISTING failure, OUT OF SCOPE for this change.
Proven pre-existing by stash-test on pristine tree during apply (PR 1). Tracked as
https://github.com/guigerdts/TelaryColor-Desktop/issues/1 — verified **OPEN** via `gh issue view 1` (`state: OPEN`, label bug).
Expected count was 242 pre-PR2; +2 = the new test_health.py tests. NOT a regression from this change.

**Cleanup pass (4.1/4.2, orchestrator disposition — Option 1)**: real cleanup applied, not reclassification:
- `backend/app/main.py:136-137` dev `__main__` block: string-form `uvicorn.run("app.main:app", ...)` → **app OBJECT** (same pattern as `entry.py:75`). Verified: `from app.main import app` object is FastAPI; `GET /health → 200 {'status': 'ok'}` via TestClient on the module-level app; `find_free_port(8000)` OK. Zero string-form `app.main:app` refs remain in project code.
- `MIGRATION_FASES.md` + `MIGRATIONPC.md`: 12 residual `uitka`/`uitable` refs → `Nuitka`; `MIGRATION_FASES.md:711` PyInstaller fallback snippet `--onefile` → `--onedir`; `MIGRATIONPC.md:228` `--onefile o --onedir` → `--onedir`. Only prohibition/decision-documenting `--onefile` mentions remain (F6 line 665, F10 line 783, line 786 — all say SHALL NOT / PROHIBIDO).
- After cleanup: `grep uitka MIGRATION_*.md` → only `uitka-build/` path refs (kept by design per ADR); `grep "app.main:app" --include=*.py backend/` (excluding venv) → 0; `sys.executable -m alembic` in production code → 0 (only test assertions proving absence); `subprocess` in `entry.py` → 0.
- **Re-verified**: focused suite 27/27 green after cleanup; full suite re-run 244 passed + 1 pre-existing (issue #1). So `test_binary.sh --help`, py_compile, YAML load unchanged green.
- Task 4.1 marked `[x]` (string-import + subprocess zero residue confirmed). Task 4.2 marked `[x]` (onefile not used; `requirements.txt` byte-identical after build-deps install — `git diff HEAD -- backend/requirements.txt` EMPTY). Remaining incomplete item is 4.2's CI-deferred execution proof only (see PARTIAL rows).

**Coverage**: ➖ Not available (no coverage tool detected in project capabilities)

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress has TDD Cycle Evidence tables for PR 2 (2.5 had RED→GREEN confirmed; 2.6/2.8 harness E2E) and PR 3 (3.1 CI gates; 3.2 docs), plus RED/GREEN rows for PR 1 tasks 1.1–1.6 |
| All tasks have tests | ✅ | 17/17 completed tasks have test files or harness/CI-gate evidence (4.1/4.2 are confirm-audits, not new code) |
| RED confirmed (tests exist) | ✅ | test files exist and were written first in PR 1/2; 2.5 RED truly failed (SPA catch-all shadowed /health — genuine failure mode). 3.1 RED is the CI's own gates (cp313 assertion + if-no-files-found:error) — cannot run locally by design |
| GREEN confirmed (tests pass) | ✅ | All 27 focused tests pass on independent re-execution this verify run |
| Triangulation adequate | ✅ | test_health: 2 cases (content-type + no-auth); test_entry: 6 distinct behaviors; test_paths: dev/frozen pairs per path resolver |
| Safety Net for modified files | ✅ | PR 1 recorded full-suite run before modification (242 + 1 pre-existing) |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 18 | 1 (test_paths.py) | pytest (mock/patch, no IO) |
| Integration | 9 | 2 (test_entry.py, test_health.py) | pytest, FastAPI TestClient, real alembic on tmp dirs |
| E2E | 1 harness | 1 (uitka-build/smoke_binary.py) | real HTTP against launched binary; dev-mode run GREEN (health 200 in 1.39s, upload 201, SPA 200, SIGKILL+relaunch 200); frozen run deferred to windows-latest CI |
| **Total** | **27 + harness** | **3 + harness** | |

---

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected

---

### Assertion Quality
**Assertion quality**: ✅ All assertions verify real behavior — 27/27 tests assert concrete values (paths, HTTP 200/JSON, table counts, migration idempotence, app-object identity, absence of subprocess machinery); no tautologies, ghost loops, type-only-alone, or smoke-only assertions found.

---

### Quality Metrics
**Linter**: ➖ Not available
**Type Checker**: ➖ Not available
**Compile check**: ✅ py_compile clean on all four `uitka-build/` scripts (serves as the build gate)

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| REQ-01 Dual-Freezer Build Tooling | Nuitka standalone build | `uitka-build/compile.py` py_compile OK + `--help` exit 0; full frozen link host-limited, scheduled in windows-latest CI | ⚠️ PARTIAL |
| REQ-01 Dual-Freezer Build Tooling | PyInstaller fallback build | `uitka-build/compile_pyinstaller.py` py_compile OK; `--onedir` + `--collect-all app` + hidden-imports verified; fallback not executed locally (documented: re-run with `--freezer pyinstaller` on CI) | ⚠️ PARTIAL |
| REQ-01 Dual-Freezer Build Tooling | Onefile mode forbidden | `rg -- --onefile uitka-build/` → only prohibition comment (`compile.py:11`); `compile_pyinstaller.py` uses `--onedir` | ✅ COMPLIANT |
| REQ-02 Build Dependency Isolation | Runtime deps unchanged | `git diff HEAD -- backend/requirements.txt` → EMPTY (exit 0); content: runtime deps only, no nuitka/pyinstaller; build deps isolated in untracked `requirements-build.txt` (nuitka>=2.6, pyinstaller>=6.11) | ✅ COMPLIANT |
| REQ-03 Dist Staging Layout | Staged folder complete | `stage_dist.py` py_compile OK; `--exe`/`--freezer`/`--staged-dir` flags verified; unit-verified both freezer layouts + exe + 3 resources (apply-progress 2.4) | ✅ COMPLIANT |
| REQ-04 Binary Smoke Verification | Boot chain verified | `test_entry_py_boot_chain` PASS (focused suite) + dev-mode smoke: health 200 in 1.39s, `.port` written, `PORT:` printed | ✅ COMPLIANT |
| REQ-04 Binary Smoke Verification | Multipart upload verified | dev-mode smoke: multipart upload → 201 (apply-progress 2.8); harness upload step verifies 2xx | ✅ COMPLIANT |
| REQ-04 Binary Smoke Verification | SPA served when staged | dev-mode smoke: GET / → 200 (apply-progress 2.8); harness SPA step + stage_dist ships frontend/dist | ✅ COMPLIANT |
| REQ-05 Size and Start-Time Gates | Size gate | dev-mode smoke measured 0.4 MiB < 200 MiB gate (apply-progress 2.8); harness gate code verified | ✅ COMPLIANT |
| REQ-05 Size and Start-Time Gates | Start-time gate | dev-mode smoke health 1.39s < 3s gate (apply-progress 2.8); harness gate code verified | ✅ COMPLIANT |
| REQ-06 Windows CI Build and Validation | Windows artifact built and validated | `.github/workflows/build-backend-windows.yml` YAML-valid (exit 0); flags match scripts verbatim (compile.py `--output-dir`, stage_dist.py `--exe`, smoke_binary.py `--exe --staged-dir`); job scheduled — CANNOT execute on Linux sandbox | ⚠️ PARTIAL |
| REQ-07 Hard Termination Tolerance | Hard kill then clean restart | dev-mode smoke: SIGKILL (exit -9) → relaunch health 200 (apply-progress 2.8); `test_apply_migrations_idempotent` PASS (WAL + re-migration safe) | ✅ COMPLIANT |
| REQ-07 Hard Termination Tolerance | Graceful shutdown on POSIX | `entry.py:64-69` SIGINT/SIGTERM handlers → `sys.exit(0)` (source verified) | ✅ COMPLIANT |
| REQ-08 Toolchain Version Consistency | Version pinned across toolchain | Docs 3.13 refs (MIGRATION_FASES.md 279/1390/1455); workflow `python-version: '3.13'`; NO 3.12 refs found in either MIGRATION doc | ✅ COMPLIANT |
| REQ-09 Frozen Resource Layout | Frozen resources resolve beside the exe | `test_migrations_dir_in_frozen` PASS, `test_static_dir_in_frozen` PASS (focused suite) | ✅ COMPLIANT |
| REQ-09 Frozen Resource Layout | Onefile rejected as invalid layout | MIGRATION_FASES.md F6 (`onefile SHALL NOT be used`) + F10 (`--onefile (PROHIBIDO)`) | ✅ COMPLIANT |
| REQ-10 Dev vs Frozen Data Location | Dev data directory created | `test_app_data_dir_in_dev` PASS (focused suite) | ✅ COMPLIANT |
| REQ-10 Dev vs Frozen Data Location | Frozen data directory created | `test_app_data_dir_in_frozen` PASS (focused suite) | ✅ COMPLIANT |
| REQ-10 Dev vs Frozen Data Location | Nuitka frozen detection | `test_is_frozen_true_when_nuitka_compiled` PASS (focused suite) | ✅ COMPLIANT |
| REQ-11 Entry Boot Chain | Full boot chain | `test_entry_py_boot_chain` PASS: in-process migrations → free port → `.port` + `PORT:` → uvicorn | ✅ COMPLIANT |
| REQ-11 Entry Boot Chain | No auto-open browser | `entry.py` has NO `webbrowser`/browser-launch code (grep: only a comment); Electron owns the window | ✅ COMPLIANT |
| REQ-11 Entry Boot Chain | Migrations do not spawn a subprocess | `test_apply_migrations_no_subprocess` PASS (subprocess.run patched to raise; `assert not hasattr(entry, "subprocess")`); entry.py source has no subprocess import | ✅ COMPLIANT |
| REQ-11 Entry Boot Chain | In-process migration applies head on clean database | `test_apply_migrations_upgrades_clean_db` PASS (11 tables + alembic_version at head), `test_apply_migrations_absolute_paths` PASS | ✅ COMPLIANT |
| REQ-11 Entry Boot Chain | Boot works with no Python interpreter | Blocker fix PROVEN by 7 entry tests (in-process alembic, app object import, no subprocess); actual frozen-bundle boot deferred to windows-latest CI | ⚠️ PARTIAL |

**Compliance summary**: 20/24 scenarios compliant; 4 PARTIAL — all four are execution-deferred to the windows-latest CI job (Nuitka link, PyInstaller fallback, CI artifact, Python-less boot). Zero FAILING, zero UNTESTED.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Backend freezer fixes (PR 1) | ✅ Implemented | `entry.py` in-process Alembic + app object to uvicorn + signal handlers; `paths.py` Nuitka `__compiled__` detection; `config.py` SECURITY guard on `is_frozen()` |
| Build tooling (PR 2) | ✅ Implemented | `compile.py` (Nuitka standalone, `--option=value`, `--nuitka-arg` passthrough, no `--strip`), `compile_pyinstaller.py` (`--onedir`), `stage_dist.py` (freezer-aware), `smoke_binary.py` (full gate suite) — all `shell=False` |
| Health router | ✅ Implemented | `backend/app/modules/health/router.py` mounted before SPA catch-all; two tests green |
| Windows CI + docs (PR 3) | ✅ Implemented | Workflow valid, 23/23 doc directives applied (git-diff cross-checked), flags match scripts |
| Requirements.txt isolation | ✅ Implemented | `git diff HEAD` empty; build deps only in `requirements-build.txt` |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Standalone/onedir only; onefile SHALL NOT be used | ✅ Yes | Tooling + F6/F10 docs prohibit it; compile_pyinstaller uses `--onedir` (residual stale doc mentions → WARNING) |
| Frozen resources resolved beside exe (`app_base_dir()`/`alembic`) | ✅ Yes | test_paths frozen matrix green; stage_dist ships alembic + alembic.ini + frontend/dist beside exe |
| Dev data `<repo>/backend/data/` vs frozen `%APPDATA%\TelaryColor\data\` | ✅ Yes | Both dir modes unit-tested |
| `entry.py` boot chain: migrate → port → `.port` → uvicorn(app object) | ✅ Yes | test_entry 7/7; source verified |
| Migrations via Alembic in-process API; NO subprocess | ✅ Yes | entry.py has no subprocess; absolute `script_location`/`prepend_sys_path` |
| Dev `python -m uvicorn app.main:app` unchanged | ✅ Yes | main.py dev `__main__` block passes the app OBJECT (cleanup applied); dev-mode docstring cite unchanged |
| Windows CI: cp313 assertion + smoke gates + artifact | ✅ Yes | Workflow YAML-valid; runs windows-latest; manual/prohibited locally |

### Issues Found
**CRITICAL**: None

**WARNING**:
- ~~4.1 residue — `backend/app/main.py:136-137` string-form `uvicorn.run("app.main:app", ...)`~~ **RESOLVED** (cleanup pass): dev `__main__` block now passes the app OBJECT (`uvicorn.run(app, ...)`, same as `entry.py:75`). Zero string-form refs in project code; dev-mode verified via TestClient (`/health → 200`).
- ~~4.2 residue — `MIGRATION_FASES.md:711` + `MIGRATIONPC.md:228` `--onefile` mentions~~ **RESOLVED** (cleanup pass): both changed to `--onedir`; tooling was already clean. Only prohibition/decision-documenting `--onefile` mentions remain (F6/F10, all SHALL NOT / PROHIBIDO).
- ~~Residual `uitka`/`uitable` references (12 total)~~ **RESOLVED** (cleanup pass): all converted to `Nuitka` (lines 58, 178, 255, 271, 273, 287, 304, 324, 359, 1636, 1954, 2039). `uitka-build/` directory name kept by design (ADR: name per plan, contents real Nuitka).

**SUGGESTION**: None

### Verdict
FAIL — incomplete runtime evidence, zero code defects (not archive-ready until the four CI-deferred scenarios carry runtime proof)
All 11 spec requirements are implemented; 20/24 scenarios are covered by green runtime evidence and the remaining 4 are execution-deferred to the windows-latest CI job (Nuitka link, PyInstaller fallback, CI artifact, Python-less boot) — none FAILING/UNTESTED. Focused suite 27/27 green **after the 4.1/4.2 cleanup pass** (full suite re-run: 244 passed + 1 pre-existing out-of-scope failure, issue #1 OPEN). Both cleanup tasks (4.1/4.2) were completed as a real cleanup per user disposition — string-form import removed from main.py dev block, `--onefile` mentions and 12 `uitka`/`uitable` doc refs converted (Nuitka/onedir) — then re-verified green. Archive requires: (a) windows-latest CI run to close scenarios 20/24 → 24/24, and (b) verify-report final re-check of tasks 18/19 before archive.