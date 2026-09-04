"""Integration test for entry.py boot chain."""
import os
import subprocess
import sys
from pathlib import Path

DATA_DIR_ENV = "TELARYCOLOR_DATA_DIR"


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

    result = subprocess.run(
        [sys.executable, str(wrapper)],
        capture_output=True,
        text=True,
        timeout=15,
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
