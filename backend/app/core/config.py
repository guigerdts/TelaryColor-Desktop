"""Application-wide settings loaded from environment / backend/.env.

See backend/.env.example for the documented variables.
"""

import logging

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import app_base_dir, db_path as _db_path
from app.core.paths import is_frozen, uploads_dir as _uploads_dir

_log = logging.getLogger(__name__)


class AppConfig(BaseSettings):
    """Central configuration for the Telary Color backend.

    Values are read from environment variables first, then from a
    ``.env`` file at the application base directory when present
    (see ``.env.example``).
    """

    model_config = SettingsConfigDict(
        env_file=str(app_base_dir() / ".env"),
        env_file_encoding="utf-8",
    )

    app_name: str = "Telary Color API"

    # default_factory defers db_path()/uploads_dir() to instantiation time.
    # Importing this module creates a module-level `settings` instance, which
    # DOES call the path helpers and may create directories.  If you need to
    # import the class without side effects, import AppConfig directly.
    database_url: str = Field(
        default_factory=lambda: f"sqlite:///{_db_path()}"
    )

    # Photo uploads (samples spec "Photo Upload Validation", design ADR-1/3):
    # portable local-FS storage resolved via app.core.paths.uploads_dir()
    # (backend/data/uploads/ in dev, %APPDATA%\TelaryColor\data\uploads\
    # when frozen). Override in production/tests via UPLOAD_DIR /
    # MAX_UPLOAD_BYTES.
    upload_dir: str = Field(default_factory=lambda: str(_uploads_dir()))
    max_upload_bytes: int = 5 * 1024 * 1024

    # JWT signing (auth spec: HS256, 12h expiry). SECRET_KEY must be
    # overridden in production via the environment / backend/.env.
    secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_hours: int = 12

    # Seed admin bootstrap (design ADR-10): env-configured first, secure
    # default fallback. Override both in production via SEED_ADMIN_USERNAME /
    # SEED_ADMIN_PASSWORD.
    seed_admin_username: str = "admin"
    seed_admin_password: str = "telary-admin"


settings = AppConfig()

# Warn once at import time when running a frozen build with dev defaults.
if is_frozen():
    _dev_defaults = {"dev-secret-change-me", "telary-admin"}
    if {settings.secret_key, settings.seed_admin_password} & _dev_defaults:
        _log.warning(
            "SECURITY: Running frozen build with default secret_key or "
            "seed_admin_password. Override via environment / .env before "
            "distribution."
        )
