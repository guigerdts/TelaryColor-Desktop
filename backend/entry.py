"""Entry point for the frozen executable.

Boot chain:
1. Apply Alembic migrations (subprocess, shell=False, 60s timeout)
2. Find a free port (preferred 8000)
3. Write .port file + stdout PORT:<port> log
4. Start uvicorn on 127.0.0.1

No browser auto-open — Electron (Fase 1+) owns the window.
"""
import os
import signal
import subprocess
import sys
from pathlib import Path

from app.core.paths import app_data_dir, db_path, migrations_dir
from app.core.port import find_free_port


def apply_migrations() -> None:
    """Run alembic upgrade head if migrations exist."""
    mig_dir = migrations_dir()
    ini_file = mig_dir.parent / "alembic.ini"
    if not ini_file.exists():
        return

    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path()}"

    subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(ini_file), "upgrade", "head"],
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def write_port_file(port: int) -> None:
    """Write the active port to .port in app data dir for Electron discovery."""
    port_file = app_data_dir() / ".port"
    port_file.write_text(str(port))


def main() -> None:
    # 1. Apply migrations
    apply_migrations()

    # 2. Find free port
    port = find_free_port(8000)

    # 3. Write port file + stdout log
    write_port_file(port)
    print(f"PORT:{port}", flush=True)

    # 4. Graceful shutdown on signals
    def shutdown(signum, frame):
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # 5. Start uvicorn
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
