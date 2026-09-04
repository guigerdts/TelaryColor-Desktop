```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:1f9ef0df53ed0bfb06f2e499a73d1207d0ec5cfc5925862e1db2780da13833c4
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 18/18
test_command: /root/TelaryColor-Desktop/backend/.venv/bin/python -m pytest tests/test_paths.py tests/test_port.py tests/test_settings.py tests/test_entry.py tests/test_config.py -q
test_exit_code: 0
test_output_hash: sha256:dcbc4cfd220ebda3e0b31590739f5f9d67cfa62d9c3d35c15dbefc0bad30601f
build_command: /root/TelaryColor-Desktop/backend/.venv/bin/python -c "from app.main import app; print('APP_IMPORT_OK')"
build_exit_code: 0
build_output_hash: sha256:eab7428a60f20e75a090cf7bc70f84353439d6725bd5dd8205e7c80c6f69a75b
```

## Verification Report

**Change**: fase0-arranque-portable-desktop
**Version**: N/A (new capability + MODIFIED base requirement)
**Mode**: Strict TDD
**Re-verification**: re-run after maintainer-authorized spec alignment (2 scenario texts aligned to delivered+designed behavior; stray `telarycolor.db` removed; tasks 2.3/2.4 resolution note added).

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 19 |
| Tasks complete | 19 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build (app import)**: Passed
```text
/root/TelaryColor-Desktop/backend/.venv/bin/python -c "from app.main import app; print('APP_IMPORT_OK')"
APP_IMPORT_OK
exit 0
```

**Tests (Fase 0 targeted)**: 26 passed / 0 failed / 0 skipped
```text
/root/TelaryColor-Desktop/backend/.venv/bin/python -m pytest tests/test_paths.py tests/test_port.py tests/test_settings.py tests/test_entry.py tests/test_config.py -q
26 passed, 1 warning in 19.51s — exit 0
```
(First execution this session: 4.27s, same 26 passed. Envelope hash is of the captured canonical run in /tmp/opencode/verify_targeted.txt.)

**Tests (full suite)**: 234 passed / 0 failed / 1 deselected (pre-existing, not caused by Fase 0)
```text
/root/TelaryColor-Desktop/backend/.venv/bin/python -m pytest tests/ --deselect tests/test_inventory.py::test_downgrade -q
234 passed, 1 deselected, 366 warnings in 523.30s — exit 0
```
The deselected `tests/test_inventory.py::test_downgrade` is a PRE-EXISTING failure: `tests/test_inventory.py` is unmodified by this change (git status confirms only alembic.ini, config.py, main.py, requirements.txt, test_config.py modified; all new core/boot/test files untracked-new). Not caused by Fase 0.

**Coverage**: Not available — `pytest-cov` not installed in the venv; not flagged as a failure per Strict TDD rules.

**Runtime smoke evidence (this re-verification)**:
```text
1) app import: APP_IMPORT_OK (app = create_app() incl. _mount_spa)
2) static_dir()  -> /root/TelaryColor-Desktop/frontend/dist (exists: True)   [dev = <repo>/frontend/dist]
3) db_path()     -> /root/TelaryColor-Desktop/backend/data/app.db (exists: True)
4) app_data_dir()-> /root/TelaryColor-Desktop/backend/data
5) orphan check  -> backend/data/telarycolor.db: DOES NOT EXIST (removed)
6) live boots (prior verify, unchanged code): uvicorn 8091 (/docs 200, SPA 200) | python -m app.main (127.0.0.1:8000) | entry.py (migrations, PORT:8000, backend/data/.port)
```

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Portable Path Resolution | Dev path resolution | `tests/test_paths.py > test_db_path_in_dev` | COMPLIANT |
| Portable Path Resolution | Frozen path resolution | `tests/test_paths.py > test_db_path_in_frozen` | COMPLIANT |
| Portable Path Resolution | Static dir in dev | `tests/test_paths.py > test_static_dir_in_dev` | COMPLIANT |
| Portable Path Resolution | Static dir frozen falls back | `tests/test_paths.py > test_static_dir_in_frozen` (returns `<exe>/frontend/dist` — passed) + `main.py` `_mount_spa` guard L101-102 (`if FRONTEND_DIST.is_dir()`) + `APP_IMPORT_OK` smoke (no app breakage) | COMPLIANT (aligned) |
| Dev vs Frozen Data Location | Dev data directory created | `tests/test_paths.py > test_app_data_dir_in_dev` | COMPLIANT |
| Dev vs Frozen Data Location | Frozen data directory created | `tests/test_paths.py > test_app_data_dir_in_frozen` | COMPLIANT |
| Dynamic Port Selection | Preferred port available | `tests/test_port.py > test_find_free_port_preferred_available` | COMPLIANT |
| Dynamic Port Selection | Preferred port busy | `tests/test_port.py > test_find_free_port_preferred_busy` | COMPLIANT |
| Port Discovery Contract | Port file written | `tests/test_entry.py > test_entry_py_boot_chain` — asserts `app_data_dir()/.port` exists and its text parses to an int port (plain text) | COMPLIANT (aligned) |
| Port Discovery Contract | Stdout port log | `tests/test_entry.py > test_entry_py_boot_chain` (asserts `PORT:` in stdout) + live `PORT:8000` boot | COMPLIANT |
| Entry Boot Chain (entry.py) | Full boot chain | `tests/test_entry.py > test_entry_py_boot_chain` + live boot (migrations → port → .port → uvicorn) | COMPLIANT |
| Entry Boot Chain (entry.py) | No auto-open browser | source inspection: no `webbrowser` import on the boot path (definitive negative) | COMPLIANT |
| Optional YAML Configuration | YAML present | `tests/test_settings.py > test_settings_loads_yaml_overrides` | COMPLIANT |
| Optional YAML Configuration | YAML absent | `tests/test_settings.py > test_settings_defaults_when_no_yaml` | COMPLIANT |
| Application Entry Point (MODIFIED) | Boot from venv | live uvicorn smoke (8091): /docs 200, SPA 200 | COMPLIANT |
| Application Entry Point (MODIFIED) | Boot from entry.py | live entry.py smoke (migrations + uvicorn serving) | COMPLIANT |
| Application Entry Point (MODIFIED) | SPA served from portable path | `test_static_dir_in_dev` + live SPA 200 from `<repo>/frontend/dist` | COMPLIANT |
| Application Entry Point (MODIFIED) | __main__ dynamic port | live `python -m app.main` smoke (uvicorn 127.0.0.1:8000 via `find_free_port`) | COMPLIANT |

**Compliance summary**: 18/18 scenarios compliant (0 partial, 0 failing, 0 untested).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| `app_base_dir()` / `app_data_dir()` / `app_log_dir()` / `db_path()` / `uploads_dir()` / `migrations_dir()` / `static_dir()` | Implemented | `paths.py`; dev under `app_base_dir()` = `parents[2]` (backend/); frozen under `%APPDATA%\TelaryColor\`; `mkdir(exist_ok=True)` on data/log/uploads |
| `sys.frozen` mode split | Implemented | `is_frozen()` via `getattr(sys, "frozen", False)` |
| `db_path()` -> `app.db` | Implemented | `app_data_dir() / "app.db"`; dev = `<repo>/backend/data/app.db` (corrected from `telarycolor.db`) |
| `static_dir()` dev -> `<repo>/frontend/dist` | Implemented | `app_base_dir().parent / "frontend" / "dist"`; exists and live-served |
| Dynamic port `find_free_port(preferred=8000)` | Implemented | socket bind `127.0.0.1:8000` -> OSError -> `127.0.0.1:0`; never `0.0.0.0` |
| Port discovery `.port` + `PORT:<port>` | Implemented | `write_port_file()` -> `<app_data_dir>/.port` plain text, stdout `PORT:<port>` flush; overwritten each boot; matches design data-flow |
| entry.py boot chain order | Implemented | migrations (subprocess alembic, `shell=False`, 60s, capture_output, `DATABASE_URL` env) -> port -> `.port`+stdout -> uvicorn `127.0.0.1`; SIGINT/SIGTERM -> exit 0; no webbrowser |
| `python -m uvicorn app.main:app` still works | Verified | live boot, /docs + API + SPA 200 |
| SPA from portable `static_dir()` | Implemented | `main.py` `FRONTEND_DIST = _static_dir()`; `_mount_spa` mounts `_SPARoute` only when dir exists (graceful skip; no app breakage) |
| `__main__` uvicorn block with `find_free_port()` | Implemented | `main.py` L126-136; live-verified |
| Optional YAML `Settings.load()` | Implemented | dataclass defaults; PyYAML optional (`pyyaml>=6.0` in requirements); defaults when absent |
| Alembic env honors `DATABASE_URL` | Verified | `alembic/env.py` env-var override; alembic.ini fallback comment added |
| `app/core/__init__.py` package | Exists | import chain verified |
| Stray `telarycolor.db` removed | Verified | `backend/data/telarycolor.db` does not exist (git-tracked data dir clean) |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-1: Preferred-port with socket-bind fallback | Yes | `find_free_port` exactly as designed |
| ADR-2: %APPDATA% for frozen data | Yes | APPDATA/TelaryColor/{data,logs}; dev under repo backend/ |
| ADR-3: `.port` file + `PORT:` stdout, no browser | Yes | implementation matches design data-flow (`<app_data_dir>/.port`); spec text now aligned too |
| ADR-4: Subprocess migrations runner | Yes | `sys.executable -m alembic -c <alembic.ini> upgrade head`, env `DATABASE_URL`, 60s timeout, capture_output |
| Path table `static_dir()` dev = `<repo>/frontend/dist` | Yes | matches design; live-served |
| Path table `db_path()` | Deviation (correct one) | design table said `telarycolor.db`; spec + existing dev DB say `app.db` — implementation follows the SPEC (documented apply defect fix); design table now matches spec after alignment |
| Call-site rewiring (uploads.py/router.py -> `uploads_dir()`) | Equivalent deviation, accepted | literal call-site edit not performed; portable uploads achieved via `config.py` `upload_dir = str(uploads_dir())`; `test_config` asserts it. Functionally equivalent — no spec broken (see WARNING-1 resolution below) |

### Issues Found
**CRITICAL**: None

**WARNING**: None open. All four prior-report warnings are resolved/accepted:
1. **WARNING-1 (tasks 2.3/2.4 call-site edit) — RESOLVED/ACCEPTED**: tasks.md 2.3/2.4 now carry the resolution note: the literal call-site uploads edit was NOT performed; portable uploads resolution is achieved equivalently via `config.py`'s `upload_dir = str(uploads_dir())` (test_config asserts it). Functionally equivalent — accepted at verify; task records now match delivered code.
2. **WARNING-2 (frozen static fallback) — CLOSED**: scenario text aligned to the delivered+designed behavior: `static_dir()` returns `<exe>/frontend/dist` and the SPA mount is skipped gracefully via the `_mount_spa` `is_dir()` guard (no app breakage). Test passes and matches the letter of the scenario.
3. **WARNING-3 (.port location) — CLOSED**: scenario text aligned to `<app_data_dir>/.port`, matching design.md data-flow and the implementation (`write_port_file()`).
4. **WARNING-4 (TDD evidence form) — ACCEPTED (form gap, not quality gap)**: apply-progress lacks the formal TDD Cycle Evidence table, but RED/GREEN evidence was recovered and re-verified: RED test files exist (5 test files), GREEN confirmed on execution (26/26 targeted, 234 full), RED/GREEN rows recorded in tasks.md. Accepted as a protocol-form gap; does not fail this verdict.

**SUGGESTION**:
1. `test_entry.py` wrapper subprocess timeout is 15s; under a cold filesystem cache the alembic subprocess exceeded it once (flake, not reproducible; re-runs pass fast). Consider raising to 30s.
2. No dedicated negative test for "no auto-open browser" or for signal-handler registration (design threat matrix asked for the latter). Add if desired.
3. `backend/data/.port` persists between boots by design (overwritten each boot); Fase 1 Electron must read `app_data_dir()/.port` (now codified in the aligned spec text).

### TDD Compliance (Strict TDD)
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | Accepted form gap | apply-progress has no formal TDD Cycle Evidence table; RED/GREEN recorded in tasks.md + apply memory "strict TDD green"; evidence re-verified this run (WARNING-4 accepted) |
| All tasks have tests | 19/19 | implementation tasks 1.1-3.3 covered by 5 test files (test_paths, test_port, test_settings, test_entry, test_config); tasks 2.5/3.2/4.1-4.4 are verification/documentation tasks evidenced by suite runs + test_config assertion |
| RED confirmed (tests exist) | 5/5 files verified | all 5 test files present and collected |
| GREEN confirmed (tests pass) | 26/26 targeted + 234 full | passed on execution this re-verification |
| Triangulation adequate | 16 path cases, 3 port cases (available/busy/bind-address), 2 settings cases (present/absent), entry boot chain integration | distinct expected values; no variance issue |
| Safety Net for modified files | Full suite re-run | 234 passed post-change (this re-verification); test_config.py assertion updated for portable db_path() |

**TDD Compliance**: 6/6 checks passed (evidence-form gap accepted; no quality gap).

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 25 | 4 | pytest |
| Integration | 1 | 1 | pytest subprocess (uvicorn mocked) |
| E2E | 0 | 0 | manual live-boot smoke performed instead |
| **Total** | **26** | **5** | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (`pytest-cov` not installed). Not a failure.

### Assertion Quality
All assertions verify real behavior — every test asserts concrete path/port/settings values (no tautologies, no empty-only checks, no ghost loops, no type-only assertions, no smoke-only tests). Mock usage limited to mode isolation (`sys.frozen`/`sys.executable`/`APPDATA`) and one socket-address assertion; mock/assertion ratio healthy. The `.port` assertion reads the file back and validates the parsed integer range (1024-65535) — real behavioral check.

### Quality Metrics
**Linter**: Not available (no ruff/flake8 in venv)
**Type Checker**: Not available (no mypy/pyright in venv)

### Verdict
**PASS** — all 7 requirements implemented and verified; 18/18 spec scenarios compliant on the aligned texts; targeted 26/26 and full suite 234 passed (1 pre-existing deselected); live boots of all three entry paths verified; zero CRITICAL, zero blockers, zero failing tests; all four prior warnings resolved or accepted; stray `telarycolor.db` removed. Archive-ready.
