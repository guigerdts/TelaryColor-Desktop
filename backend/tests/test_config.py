"""Config: pydantic-settings loads documented defaults and env overrides.

Covers the app configuration layer: values come from environment
variables (or backend/.env, see .env.example) with safe LAN defaults.
"""

from app.core.config import Settings
from app.core.paths import db_path, uploads_dir


def test_defaults_when_env_unset(monkeypatch) -> None:
    monkeypatch.delenv("APP_NAME", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.app_name == "Telary Color API"
    assert settings.database_url == f"sqlite:///{db_path()}"


def test_env_vars_override_defaults(monkeypatch) -> None:
    monkeypatch.setenv("APP_NAME", "Telary Test")
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/forced.db")

    settings = Settings(_env_file=None)

    assert settings.app_name == "Telary Test"
    assert settings.database_url == "sqlite:////tmp/forced.db"


def test_upload_settings_defaults_when_env_unset(monkeypatch) -> None:
    monkeypatch.delenv("UPLOAD_DIR", raising=False)
    monkeypatch.delenv("MAX_UPLOAD_BYTES", raising=False)

    settings = Settings(_env_file=None)

    assert settings.upload_dir == str(uploads_dir())
    assert settings.max_upload_bytes == 5 * 1024 * 1024


def test_upload_settings_env_vars_override_defaults(monkeypatch) -> None:
    monkeypatch.setenv("UPLOAD_DIR", "/tmp/uploads")
    monkeypatch.setenv("MAX_UPLOAD_BYTES", "1048576")

    settings = Settings(_env_file=None)

    assert settings.upload_dir == "/tmp/uploads"
    assert settings.max_upload_bytes == 1048576