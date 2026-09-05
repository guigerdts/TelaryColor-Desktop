"""Entry point for the frozen executable.

Boot chain:
1. Apply Alembic migrations (in-process via alembic.command.upgrade)
2. Find a free port (preferred 8000)
3. Write .port file + stdout PORT:<port> log
4. Start uvicorn on 127.0.0.1

No browser auto-open — Electron (Fase 1+) owns the window.
"""
import os
import signal
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config

from app.core.paths import app_data_dir, db_path, migrations_dir
from app.core.port import find_free_port
from app.main import app


def apply_migrations() -> None:
    """Run alembic upgrade head in-process if migrations exist.

    Aborts the boot if the migration fails — starting against an unmigrated
    database would cause silent data corruption.
    """
    mig_dir = migrations_dir()
    ini_file = mig_dir.parent / "alembic.ini"
    if not ini_file.exists():
        return

    cfg = Config(str(ini_file))
    cfg.set_main_option("script_location", str(mig_dir))
    cfg.set_main_option("prepend_sys_path", str(mig_dir.parent))
    os.environ["DATABASE_URL"] = f"sqlite:///{db_path()}"

    try:
        command.upgrade(cfg, "head")
    except Exception as exc:
        print(f"FATAL: alembic migration failed: {exc}", file=sys.stderr)
        sys.exit(1)


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

    # 5. Start uvicorn with the app OBJECT (never a string import — freezers
    # need the static `from app.main import app` trace).
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()