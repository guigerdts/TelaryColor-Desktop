"""Tests for portable path resolution (app.core.paths)."""
import os
import sys
from pathlib import Path
from unittest.mock import patch

import app.core.paths as paths

from app.core.paths import (
    app_base_dir,
    app_data_dir,
    app_log_dir,
    db_path,
    is_frozen,
    migrations_dir,
    static_dir,
    uploads_dir,
)


# -- is_frozen ---------------------------------------------------------------

def test_is_frozen_false_in_dev():
    """In dev mode sys.frozen is absent/False."""
    assert is_frozen() is False


def test_is_frozen_true_when_set():
    with patch.object(sys, "frozen", True, create=True):
        assert is_frozen() is True


def test_is_frozen_true_when_nuitka_compiled():
    """Nuitka marks modules with __compiled__ instead of sys.frozen."""
    with patch.object(paths, "__compiled__", True, create=True):
        assert is_frozen() is True


def test_app_base_dir_frozen_nuitka_only(tmp_path):
    """Nuitka-only frozen run (__compiled__ present, sys.frozen absent)
    resolves exe dir + %APPDATA% data layout, never the dev repo paths."""
    fake_exe = tmp_path / "server.exe"
    fake_exe.write_text("fake")
    with (
        patch.object(paths, "__compiled__", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        # is_frozen() must see __compiled__ even though sys.frozen is absent.
        assert is_frozen() is True
        # Exe dir, not backend/.
        assert app_base_dir() == tmp_path
        # %APPDATA%\\TelaryColor\\data, not <repo>/backend/data.
        assert app_data_dir() == tmp_path / "appdata" / "TelaryColor" / "data"


# -- app_base_dir ------------------------------------------------------------

def test_app_base_dir_dev_points_to_backend():
    """In dev, app_base_dir() resolves to the backend/ directory."""
    base = app_base_dir()
    assert base.exists()
    assert base.name == "backend"


# -- app_data_dir ------------------------------------------------------------

def test_app_data_dir_in_dev():
    d = app_data_dir()
    assert d.exists()
    assert d.is_dir()
    assert "data" in d.name


def test_app_data_dir_in_frozen(tmp_path):
    fake_exe = tmp_path / "server.exe"
    fake_exe.write_text("fake")
    fake_data = tmp_path / "appdata" / "TelaryColor" / "data"
    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        d = app_data_dir()
        assert d == fake_data


# -- db_path -----------------------------------------------------------------

def test_db_path_in_dev():
    p = db_path()
    assert p.name == "app.db"
    assert p.parent.name == "data"
    # dev DB lives inside the repo tree under backend/data
    assert str(p).startswith(str(Path(__file__).resolve().parents[2]))


def test_db_path_in_frozen(tmp_path):
    fake_exe = tmp_path / "server.exe"
    fake_exe.write_text("fake")
    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        p = db_path()
        assert p.name == "app.db"
        assert "TelaryColor" in str(p)


# -- uploads_dir -------------------------------------------------------------

def test_uploads_dir_in_dev():
    d = uploads_dir()
    assert d.exists()
    assert d.is_dir()
    assert d.name == "uploads"


def test_uploads_dir_in_frozen(tmp_path):
    fake_exe = tmp_path / "server.exe"
    fake_exe.write_text("fake")
    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        d = uploads_dir()
        assert d.exists()
        assert d.name == "uploads"
        assert "TelaryColor" in str(d)


# -- migrations_dir ----------------------------------------------------------

def test_migrations_dir_in_dev():
    d = migrations_dir()
    assert d.exists()
    assert d.is_dir()
    assert d.name == "alembic"
    assert "backend" in str(d)


def test_migrations_dir_in_frozen(tmp_path):
    fake_exe = tmp_path / "resources" / "backend" / "server.exe"
    fake_exe.parent.mkdir(parents=True)
    fake_exe.write_text("fake")
    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        d = migrations_dir()
        assert d.name == "alembic"
        assert "TelaryColor" not in str(d)  # frozen: <exe>/alembic, not APPDATA


# -- app_log_dir -------------------------------------------------------------

def test_app_log_dir_in_dev():
    d = app_log_dir()
    assert d.exists()
    assert d.is_dir()
    assert "logs" in d.name


def test_app_log_dir_in_frozen(tmp_path):
    fake_exe = tmp_path / "server.exe"
    fake_exe.write_text("fake")
    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        d = app_log_dir()
        assert d.exists()
        assert d.name == "logs"
        assert "TelaryColor" in str(d)


# -- static_dir --------------------------------------------------------------

def test_static_dir_in_dev():
    d = static_dir()
    assert d.name == "dist"
    assert d.parent.name == "frontend"
    # dev SPA lives at repo-root/frontend/dist, NOT backend/frontend/dist
    assert d.parent.parent == Path(__file__).resolve().parents[2]


def test_static_dir_in_frozen(tmp_path):
    fake_exe = tmp_path / "server.exe"
    fake_exe.write_text("fake")
    with (
        patch.object(sys, "frozen", True, create=True),
        patch.object(sys, "executable", str(fake_exe), create=True),
        patch.dict(os.environ, {"APPDATA": str(tmp_path / "appdata")}),
    ):
        d = static_dir()
        assert d.name == "dist"
        assert d.parent.name == "frontend"


# -- app_data_dir: dev path lives inside repo tree ----------------------------
def test_app_data_dir_dev_starts_with_repo_root():
    """Dev data dir lives inside the repo tree, never a global path."""
    d = app_data_dir()
    assert str(d).startswith(str(Path(__file__).resolve().parents[2]))
