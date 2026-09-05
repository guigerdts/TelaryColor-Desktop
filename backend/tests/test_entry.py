"""Integration test for entry.py boot chain."""
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from app.core.paths import db_path

import entry

DATA_DIR_ENV = "TELARYCOLOR_DATA_DIR"
BACKEND_DIR = Path(__file__).resolve().parents[1]
HEAD_REVISION = "0006_paint_type_unique"

# The eleven domain tables from design.md "Data Model" (mirrors the
# EXPECTED_TABLES set in test_migration.py, kept local to avoid cross-module
# test coupling).
EXPECTED_TABLES = {
    "users",
    "access_logs",
    "pantone_colors",
    "formulas",
    "formula_ingredients",
    "designs",
    "design_colors",
    "samples",
    "inventory_items",
    "inventory_transactions",
    "formula_designs",
}


def _table_names(db_path_str: str) -> set[str]:
    conn = sqlite3.connect(db_path_str)
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
        return {row[0] for row in rows}
    finally:
        conn.close()


def _alembic_version(db_path_str: str) -> str:
    conn = sqlite3.connect(db_path_str)
    try:
        return conn.execute("SELECT version_num FROM alembic_version").fetchone()[0]
    finally:
        conn.close()


def test_entry_py_boot_chain(tmp_path):
    """entry.py writes .port file and outputs PORT:<port> on stdout.

    uvicorn is mocked to prevent starting a real server.
    The .port file is written into tmp_path to avoid repo pollution.
    """
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    backend_dir = Path(__file__).resolve().parents[1]

    # Use a small test wrapper that mocks uvicorn.run before entry.main()
    wrapper = tmp_path / "test_entry_wrapper.py"
    wrapper.write_text(
        f"""\
import sys
sys.path.insert(0, "{backend_dir}")
# Mock uvicorn.run to prevent server start
import types
fake_uvicorn = types.ModuleType("uvicorn")
def _fake_run(*a, **kw):
    pass
fake_uvicorn.run = _fake_run
sys.modules["uvicorn"] = fake_uvicorn

from entry import main
main()
"""
    )

    env = os.environ.copy()
    env[DATA_DIR_ENV] = str(data_dir)

    # 90s: importing app.main alone takes ~15s on CI-class hardware, so the
    # historical 15s budget was flaky even before the subprocess migration was
    # removed; the assertions below are the boot-chain contract (PORT:/.port).
    result = subprocess.run(
        [sys.executable, str(wrapper)],
        capture_output=True,
        text=True,
        timeout=90,
        cwd=str(backend_dir),
        env=env,
    )

    # Assert stdout contains PORT:<port> line
    assert "PORT:" in result.stdout, (
        f"Expected PORT:<port> in stdout.\nstdout: {result.stdout!r}\nstderr: {result.stderr!r}"
    )

    # Assert .port file was written in the isolated data dir
    port_file = data_dir / ".port"
    assert port_file.exists(), f".port file not found at {port_file}"
    port_value = int(port_file.read_text().strip())
    assert 1024 <= port_value <= 65535, f"Invalid port: {port_value}"


# -- in-process alembic (design ADR-1, portable-startup "Entry Boot Chain") ----

def _restore_env_var(name: str, previous) -> None:
    if previous is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = previous


def test_apply_migrations_upgrades_clean_db(tmp_path, monkeypatch):
    """In-process migration on a clean database reaches head: all 11 domain
    tables plus alembic_version, stamped at the latest revision."""
    (tmp_path / "data").mkdir(parents=True)
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "data"))
    previous = os.environ.get("DATABASE_URL")
    try:
        entry.apply_migrations()
    finally:
        _restore_env_var("DATABASE_URL", previous)

    db = db_path()
    assert db.exists()
    tables = _table_names(str(db))
    assert tables == EXPECTED_TABLES | {"alembic_version"}, (
        f"unexpected table set after in-process upgrade: {sorted(tables)}"
    )
    assert _alembic_version(str(db)) == HEAD_REVISION


def test_apply_migrations_idempotent(tmp_path, monkeypatch):
    """A second in-process upgrade changes nothing (no-op at head)."""
    (tmp_path / "data").mkdir(parents=True)
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "data"))
    previous = os.environ.get("DATABASE_URL")
    try:
        entry.apply_migrations()
        tables_first = _table_names(str(db_path()))
        version_first = _alembic_version(str(db_path()))

        entry.apply_migrations()
    finally:
        _restore_env_var("DATABASE_URL", previous)

    assert _table_names(str(db_path())) == tables_first
    assert _alembic_version(str(db_path())) == version_first


def test_apply_migrations_failure_aborts_boot(tmp_path, monkeypatch, capsys):
    """A broken migration dir aborts the boot with exit code 1 and a FATAL
    message — never starts against an unmigrated/corrupt database."""
    fake_alembic = tmp_path / "alembic"
    (fake_alembic / "versions").mkdir(parents=True)
    (fake_alembic / "versions" / "0007_broken.py").write_text(
        "this is not valid python !!!"
    )
    ini = tmp_path / "alembic.ini"
    ini.write_text((BACKEND_DIR / "alembic.ini").read_text())

    monkeypatch.setattr(entry, "migrations_dir", lambda: fake_alembic)
    (tmp_path / "data").mkdir(parents=True)
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "data"))

    with pytest.raises(SystemExit) as exc:
        entry.apply_migrations()
    assert exc.value.code == 1
    captured = capsys.readouterr()
    assert "FATAL" in captured.err


def test_apply_migrations_absolute_paths(tmp_path, monkeypatch):
    """The alembic Config handed to the in-process upgrade carries absolute,
    CWD-independent script_location/prepend_sys_path and the DB URL derived
    from db_path() via the DATABASE_URL env var."""
    captured = {}

    def _fake_upgrade(cfg, target):
        captured["script_location"] = cfg.get_main_option("script_location")
        captured["prepend_sys_path"] = cfg.get_main_option("prepend_sys_path")
        captured["sqlalchemy_url"] = os.environ.get("DATABASE_URL")

    monkeypatch.setattr(entry.command, "upgrade", _fake_upgrade)
    (tmp_path / "data").mkdir(parents=True)
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "data"))

    entry.apply_migrations()

    assert captured["script_location"] == str(BACKEND_DIR / "alembic")
    assert captured["prepend_sys_path"] == str(BACKEND_DIR)
    assert Path(captured["script_location"]).is_absolute()
    assert Path(captured["prepend_sys_path"]).is_absolute()
    assert captured["sqlalchemy_url"] == f"sqlite:///{db_path()}"


def test_apply_migrations_no_subprocess(tmp_path, monkeypatch):
    """Migrations run in-process: subprocess.run is never consulted."""
    (tmp_path / "data").mkdir(parents=True)
    monkeypatch.setenv(DATA_DIR_ENV, str(tmp_path / "data"))

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("subprocess.run must not be called during migrations")

    # Structural proof: the entry module no longer imports subprocess at all.
    assert not hasattr(entry, "subprocess")
    # Behavioural proof: even a poisoned subprocess.run would surface a call.
    monkeypatch.setattr("subprocess.run", _fail_if_called)
    previous = os.environ.get("DATABASE_URL")
    try:
        entry.apply_migrations()
    finally:
        _restore_env_var("DATABASE_URL", previous)

    tables = _table_names(str(db_path()))
    assert EXPECTED_TABLES <= tables
    assert _alembic_version(str(db_path())) == HEAD_REVISION


def test_uvicorn_receives_app_object(tmp_path):
    """entry.main() hands uvicorn the app OBJECT (from app.main import app),
    never a string reference — freezers need a static import trace."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    backend_dir = Path(__file__).resolve().parents[1]

    wrapper = tmp_path / "test_entry_uvicorn_wrapper.py"
    wrapper.write_text(
        f"""\
import sys
sys.path.insert(0, "{backend_dir}")
# Mock uvicorn.run to capture what entry.main() hands it.
import types
fake_uvicorn = types.ModuleType("uvicorn")
def _fake_run(app, *a, **kw):
    import app.main as main_mod
    print(f"UVICORN_APP_IS_OBJ={{not isinstance(app, str)}}")
    print(f"UVICORN_APP_IS_APP={{app is main_mod.app}}")
fake_uvicorn.run = _fake_run
sys.modules["uvicorn"] = fake_uvicorn

from entry import main
main()
"""
    )

    env = os.environ.copy()
    env[DATA_DIR_ENV] = str(data_dir)

    result = subprocess.run(
        [sys.executable, str(wrapper)],
        capture_output=True,
        text=True,
        timeout=90,
        cwd=str(backend_dir),
        env=env,
    )

    assert result.returncode == 0, (
        f"entry.main() boot failed.\nstdout: {result.stdout!r}\nstderr: {result.stderr!r}"
    )
    assert "UVICORN_APP_IS_OBJ=True" in result.stdout, (
        f"uvicorn did not receive an app object.\nstdout: {result.stdout!r}"
    )
    assert "UVICORN_APP_IS_APP=True" in result.stdout, (
        f"uvicorn did not receive app.main.app.\nstdout: {result.stdout!r}"
    )
