# Proposal: Fase 0 — Portable Startup for Desktop

## Intent

TelaryColor runs as a CWD-relative FastAPI app. To ship a self-contained Windows exe (uitka + Electron later), paths and port must resolve portably with a boot contract the Electron shell can read. This fase makes dev and frozen-exe behavior equivalent without touching business logic.

## Scope

### In Scope
- Portable paths (`app_base_dir`, `app_data_dir`, `app_log_dir`, `db_path`, `uploads_dir`, `migrations_dir`, `static_dir`); data in `%APPDATA%\TelaryColor\` when frozen, repo `data/` in dev.
- Dynamic port: preferred 8000, fallback on busy.
- Boot entry (`entry.py`): migrations → port → `.port` file + stdout port log (Electron discovery). No auto-open browser.
- Optional YAML config dataclass (`settings.py`); path tests (`test_paths.py`).

### Out of Scope
- Electron shell (Fase 1+ reads `.port`), uitka/PyInstaller, installer, tray UI, auto-update, backups, auto-open browser, module logic changes.

## Capabilities

### New Capabilities
- `portable-startup`: portable path resolution, dynamic port with preferred-port fallback, and the boot/discovery contract (`.port` + stdout port log) for dev and frozen execution.

### Modified Capabilities
- `base` (Application Entry Point): boot gains a portable entry path and dynamic port; `python -m uvicorn app.main:app` stays supported but is not the only route. SPA/dist (`static_dir`) and default DB paths become portable.

## Approach

Plan-faithful (exploration Approach 1) with bug fixes. Add `paths.py`/`port.py`/`settings.py`/`entry.py`/`test_paths.py`; rewire `config.py` (`database_url` via `db_path()`), `main.py` (`static_dir()` + `__main__` block), `uploads.py`/`samples/router.py` (`uploads_dir()`), `alembic.ini`. Fix typos: `exist_ok.0exist_ok=True` → `exist_ok=True`; `app_base_dir` → `app_base_dir()`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/app/core/{paths,port,settings}.py` | New | Paths, port, YAML config |
| `backend/entry.py` | New | Migrations → port → `.port` + stdout, uvicorn |
| `backend/tests/test_paths.py` | New | Path tests, dev + frozen |
| `backend/app/core/config.py` | Modified | `database_url` from `db_path()` |
| `backend/app/main.py` | Modified | `static_dir()` + `__main__` block |
| `backend/app/modules/samples/{uploads,router}.py` | Modified | Use `uploads_dir()` |
| `backend/alembic.ini` | Modified | Portable migration/URL resolution |
| `backend/tests/test_config.py` | Modified | Update DB default assertion |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Alembic path in frozen exe | Med | `migrations_dir()` + runtime URL via env.py |
| `test_config.py` breakage | Low | Update assertion |
| PyYAML dependency | Low | Confirm/append requirements.txt |

## Rollback Plan

No schema change; revert is a three-file undo. Revert `config.py`, `main.py`, `alembic.ini`, and the two samples files; delete the five new files. `database_url` falls back to the old CWD-relative default; dev boot still works. Only if the user already ran frozen must `%APPDATA%` data migrate back — otherwise none.

## Dependencies

- PyYAML (if not already a backend dependency) for `settings.py`.
- Alembic `env.py` honors the runtime DB URL.

## Success Criteria

- [ ] `pytest backend/tests/test_paths.py` passes.
- [ ] `python -m uvicorn app.main:app` still boots and serves.
- [ ] Port 8000 busy → free port written to `.port` + stdout.
- [ ] Dev DB/uploads under repo `data/`; frozen `%APPDATA%` covered by tests.
- [ ] Migrations apply against the resolved DB path.
- [ ] `test_config.py` updated and green.
