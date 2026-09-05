"""PyInstaller onedir build — FALLBACK freezer for the Telary Color backend.

Run from anywhere::

    backend/.venv/bin/python uitka-build/compile_pyinstaller.py [--distpath DIR]

Produces ``<distpath>/telarycolor-server/`` (default ``backend/dist/``)
containing the ``telarycolor-server`` executable (``.exe`` on Windows).
Onefile mode is forbidden (design ADR-2): a temp-dir extraction would
break exe-relative resources. Resource layout is owned by
``stage_dist.py`` (ADR-3) — deliberately NO ``--add-data``: PyInstaller 6
onedir would place data in ``_internal/``, not beside the exe.

Hidden imports cover the modules freezers cannot statically trace:
``pydantic_core`` and ``python_multipart`` (C extensions), the
``bcrypt._bcrypt`` binary module, and the SQLite dialect loaded
lazily by SQLAlchemy.

Threat matrix: list-arg subprocess only, ``shell=False``.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"

EXE_NAME = "telarycolor-server"
APP_ENTRY = BACKEND_DIR / "entry.py"


def build_args(distpath: Path, extra_pyinstaller_args: list[str] | None = None) -> list[str]:
    """Assemble the list-arg PyInstaller command (shell=False)."""
    args: list[str] = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onedir",
        "--name",
        EXE_NAME,
        "--distpath",
        str(distpath),
        "--collect-all",
        "app",
        "--hidden-import",
        "app",
        "--hidden-import",
        "pydantic_core",
        "--hidden-import",
        "python_multipart",
        "--hidden-import",
        "bcrypt",
        "--hidden-import",
        "sqlalchemy.dialects.sqlite",
    ]
    if extra_pyinstaller_args:
        args.extend(extra_pyinstaller_args)
    args.append(str(APP_ENTRY))
    return args


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--distpath",
        type=Path,
        default=BACKEND_DIR / "dist",
        help="PyInstaller dist dir (default: backend/dist; onedir lands in "
        "telarycolor-server/ there)",
    )
    args = parser.parse_args()

    cmd = build_args(args.distpath)
    print("Running:", " ".join(cmd), flush=True)
    # cwd=backend keeps entry.py's `app` package importable from CWD.
    subprocess.run(cmd, cwd=BACKEND_DIR, check=True)
    print(
        f"OK: onedir build at {args.distpath / EXE_NAME} — now run "
        f"stage_dist.py (or stage_dist.py --freezer pyinstaller) to "
        f"assemble the distributable folder.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())