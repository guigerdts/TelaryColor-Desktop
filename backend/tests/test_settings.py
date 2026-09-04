"""Tests for optional YAML settings (app.core.settings)."""
from pathlib import Path

from app.core.settings import Settings


def test_settings_defaults_when_no_yaml(tmp_path: Path) -> None:
    """When no YAML file exists, all defaults apply without error."""
    yaml_path = tmp_path / "nonexistent.yaml"
    s = Settings.load(yaml_path)
    assert s.port == 8000
    assert s.auto_start is False
    assert s.minimize_to_tray is True
    assert s.theme == "dark"


def test_settings_loads_yaml_overrides(tmp_path: Path) -> None:
    """YAML values override defaults when the file exists."""
    yaml_path = tmp_path / "config.yaml"
    yaml_path.write_text("port: 9000\ntheme: light\n")
    s = Settings.load(yaml_path)
    assert s.port == 9000
    assert s.theme == "light"
    # Non-overridden fields keep defaults
    assert s.auto_start is False
