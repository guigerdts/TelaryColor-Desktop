# Tasks: Fase 0 — Portable Startup for Desktop

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Core utilities + tests + integration rewire | PR 1 | `cd backend && python -m pytest tests/test_paths.py tests/test_port.py tests/test_settings.py tests/test_config.py -v` | `cd backend && python -m uvicorn app.main:app` — verify SPA + API still serve; `.port` file written | Delete `core/{paths,port,settings}.py`, `tests/test_paths.py`; revert `config.py`, `main.py`, `uploads.py`, `router.py`, `alembic.ini` |

## Phase 1: Foundation — Core Utilities (TDD)

- [x] 1.1 RED: Create `backend/app/core/__init__.py` (empty file — needed for `app.core` package import)
- [x] 1.2 RED: Create `backend/tests/test_paths.py` — write failing tests: `test_is_frozen_false_in_dev`, `test_app_data_dir_in_dev`, `test_db_path_in_dev`, `test_uploads_dir_in_dev`, `test_app_data_dir_in_frozen` (mocked)
- [x] 1.3 GREEN: Create `backend/app/core/paths.py` — implement `is_frozen()`, `app_base_dir()`, `app_data_dir()`, `app_log_dir()`, `db_path()`, `uploads_dir()`, `migrations_dir()`, `static_dir()`. Apply plan typo fixes: `exist_ok=True` (not `exist_ok.0exist_ok=True`); `app_base_dir()` (not `app_base_dir`)
- [x] 1.4 RED: Create `backend/tests/test_port.py` — write failing tests: `test_find_free_port_preferred_available` (mock bind succeeds), `test_find_free_port_preferred_busy` (mock bind raises OSError), `test_bind_address_is_localhost` (security: assert `127.0.0.1` not `0.0.0.0`)
- [x] 1.5 GREEN: Create `backend/app/core/port.py` — implement `find_free_port(preferred=8000)` with socket bind, fallback to `('127.0.0.1', 0)`
- [x] 1.6 RED: Create `backend/tests/test_settings.py` — write failing tests: `test_settings_defaults_when_no_yaml`, `test_settings_loads_yaml_overrides` (use `tmp_path`)
- [x] 1.7 GREEN: Create `backend/app/core/settings.py` — implement `@dataclass Settings` with `load(path)` classmethod; optional PyYAML; defaults when absent. Ensure `pyyaml` is in `backend/requirements.txt`

## Phase 2: Integration — Rewire Existing Modules

- [x] 2.1 Modify `backend/app/core/config.py` line 19 — change `database_url` default from `"sqlite:///./data/app.db"` to `f"sqlite:///{db_path()}"` (import `db_path` from `app.core.paths`)
- [x] 2.2 Modify `backend/app/main.py` line 38 — replace `FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"` with `from app.core.paths import static_dir` + use `static_dir()` in `_mount_spa`. Add `if __name__ == '__main__'` block with `find_free_port(8000)` + `uvicorn.run()`
- [x] 2.3 Modify `backend/app/modules/samples/uploads.py` line 85 — replace `Path(settings.upload_dir)` with `from app.core.paths import uploads_dir` + `uploads_dir()`. Remove `from app.core.config import settings` if no longer needed here
- [x] 2.4 Modify `backend/app/modules/samples/router.py` lines 43, 226 — replace `Path(settings.upload_dir)` with `uploads_dir()` import. Keep `settings` import only if other fields still used (check: `max_upload_bytes` still referenced on line 217 — keep `settings` import)
  - NOTE (verify WARNING-1 resolution): The literal call-site edit in uploads.py/router.py was NOT performed. Portable uploads resolution is achieved equivalently via `config.py`'s `upload_dir` default = `str(uploads_dir())`; `test_config` asserts `upload_dir == str(uploads_dir())`. Functionally equivalent — no spec broken — accepted at verify.
- [x] 2.5 Modify `backend/alembic.ini` line 9 — document that `sqlalchemy.url` is a fallback; `entry.py` passes `DATABASE_URL` env var (the line stays as-is for dev; no code change needed — the env var override in `env.py` already handles this). Verify `env.py` honors `DATABASE_URL` env var

## Phase 3: Boot Entry + Plan Typos Fix

- [x] 3.1 Create `backend/entry.py` — implement boot chain: `apply_migrations()` (subprocess, `shell=False`, 60s timeout, capture stderr) → `find_free_port(8000)` → `write_port_file()` (writes `<app_data_dir>/.port`) → stdout `PORT:<port>` → `uvicorn.run()` on `127.0.0.1`. Register `SIGINT`/`SIGTERM` handlers. No `webbrowser.open()`
- [x] 3.2 Verify the two plan typos from MIGRATION_FASES.md §5 are fixed in `paths.py`: (1) `exist_ok.0exist_ok=True` → `exist_ok=True`, (2) `app_base_dir` → `app_base_dir()` in `static_dir()`
- [x] 3.3 RED: Add entry.py integration test to `backend/tests/test_paths.py` or `backend/tests/test_boot.py` — subprocess `python entry.py`, assert `.port` file written in temp data dir, assert stdout contains `PORT:<port>`

## Phase 4: Verify + Cleanup

- [x] 4.1 Run full test suite: `cd backend && python -m pytest tests/ -v` — all existing tests pass, new tests green
- [x] 4.2 Manual smoke: `cd backend && python -m uvicorn app.main:app` — verify SPA loads, `/docs` accessible, `db_path()` resolves to absolute path in logs
- [x] 4.3 Verify `test_config.py` line 17 assertion updated to match portable `database_url` format (the `"sqlite:///./data/app.db"` assertion must change since the default now uses `db_path()`)
- [x] 4.4 Confirm `backend/app/core/__init__.py` exists (package import chain works for `from app.core.paths import ...`)
