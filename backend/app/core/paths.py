"""Portable path resolution — works in dev and frozen exe."""
import os
import sys
from pathlib import Path


def is_frozen() -> bool:
    """True when running as a PyInstaller bundle."""
    return getattr(sys, "frozen", False)


def app_base_dir() -> Path:
    """Base directory of the application (exe dir or repo backend/ root)."""
    if is_frozen():
        return Path(sys.executable).parent
    # backend/app/core/paths.py → parents[2] == backend/
    return Path(__file__).resolve().parents[2]


def app_data_dir() -> Path:
    """Persistent data directory (survives reinstalls).

    Set ``TELARYCOLOR_DATA_DIR`` to override the default (used by tests).
    """
    override = os.environ.get("TELARYCOLOR_DATA_DIR")
    if override:
        return Path(override)
    if is_frozen():
        # APPDATA is always set on Windows; fall back to home dir on Linux frozen.
        appdata = os.environ.get("APPDATA") or Path.home()
        data = Path(appdata) / "TelaryColor" / "data"
    else:
        data = app_base_dir() / "data"
    data.mkdir(parents=True, exist_ok=True)
    return data


def app_log_dir() -> Path:
    """Log directory."""
    if is_frozen():
        appdata = os.environ.get("APPDATA") or Path.home()
        log = Path(appdata) / "TelaryColor" / "logs"
    else:
        log = app_base_dir() / "logs"
    log.mkdir(parents=True, exist_ok=True)
    return log


def db_path() -> Path:
    """SQLite database file path."""
    return app_data_dir() / "app.db"


def uploads_dir() -> Path:
    """Photo uploads directory."""
    d = app_data_dir() / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def migrations_dir() -> Path:
    """Alembic migrations directory."""
    return app_base_dir() / "alembic"


def static_dir() -> Path:
    """Frontend static build directory."""
    if is_frozen():
        # Frozen layout: <exe-dir>/frontend/dist
        return app_base_dir() / "frontend" / "dist"
    # Dev layout: repo-root/frontend/dist (app_base_dir() == backend/)
    return app_base_dir().parent / "frontend" / "dist"
