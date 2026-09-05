"""Optional YAML configuration for the desktop app.

Config file location: %APPDATA%/TelaryColor/config.yaml (Windows) or
~/.config/telarycolor/config.yaml (Linux/macOS).  All settings have
sensible defaults — the file is optional.
"""
import os
from dataclasses import dataclass
from pathlib import Path

try:
    import yaml as _yaml
except ImportError:
    _yaml = None  # optional dependency — Settings works without it


@dataclass
class Settings:
    port: int = 8000
    auto_start: bool = False
    minimize_to_tray: bool = True
    backup_enabled: bool = True
    backup_interval_hours: int = 24
    backup_keep_days: int = 30
    log_level: str = "info"
    theme: str = "dark"

    @classmethod
    def load(cls, path: Path | None = None) -> "Settings":
        """Load settings from an optional YAML file, falling back to defaults."""
        if path is None:
            if os.name == "nt":
                appdata = os.environ.get("APPDATA") or Path.home()
                path = Path(appdata) / "TelaryColor" / "config.yaml"
            else:
                path = Path.home() / ".config" / "telarycolor" / "config.yaml"

        if path.exists() and _yaml is not None:
            try:
                with open(path, encoding="utf-8") as f:
                    data = _yaml.safe_load(f) or {}
            except Exception:
                # Malformed YAML — fall back to defaults rather than crashing.
                # The config file is documented as optional.
                return cls()
            valid = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
            return cls(**valid)
        return cls()
