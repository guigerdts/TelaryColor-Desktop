"""Nuitka standalone build — PRIMARY freezer for the Telary Color backend.

Run from anywhere::

    backend/.venv/bin/python uitka-build/compile.py [--output-dir DIR]

Produces ``<output-dir>/telarycolor-server.dist/`` containing the
``telarycolor-server`` executable (``.exe`` on Windows). The resource
layout (``alembic/``, ``alembic.ini``, ``frontend/dist``) is copied
beside the exe by ``stage_dist.py`` — never baked into the binary
(design ADR-2/ADR-3, portable-startup plan §4.1; onefile is forbidden).

Windows-only flag ``--windows-console-mode=disable`` is added only on
win32; Nuitka rejects it on other platforms.

Threat matrix: every subprocess call uses list arguments with
``shell=False`` — no shell interpolation anywhere in the build chain.
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


def build_args(output_dir: Path, extra_nuitka_args: list[str] | None = None) -> list[str]:
    """Assemble the list-arg Nuitka command (shell=False, no string join)."""
    args: list[str] = [
        sys.executable,
        "-m",
        "nuitka",
        "--standalone",
        "--assume-yes-for-downloads",
        # Nuitka's option parser requires the `--flag=value` form.
        f"--output-dir={output_dir}",
        f"--output-filename={EXE_NAME}",
        "--include-package=app",
        "--include-module=bcrypt._bcrypt",
        "--include-module=sqlalchemy.dialects.sqlite",
        "--include-package=pydantic_core",
        "--include-package=python_multipart",
        "--nofollow-import-to=pytest,httpx,tkinter,unittest,setuptools,distutils,_distutils_hack",
        # --strip was removed in Nuitka 4.x — stripping is now the default
        # behavior (only --unstripped disables it). Intent preserved.
    ]
    if sys.platform == "win32":
        args.append("--windows-console-mode=disable")
    if extra_nuitka_args:
        args.extend(extra_nuitka_args)
    args.append(str(APP_ENTRY))
    return args


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=REPO_ROOT,
        help="Nuitka output dir (default: repo root; dist lands in "
        "telarycolor-server.dist/ there)",
    )
    parser.add_argument(
        "--nuitka-arg",
        action="append",
        default=None,
        metavar="FLAG",
        help="Extra flag forwarded verbatim to Nuitka (repeatable; build "
        "tuning such as --low-memory or --jobs=N on constrained machines).",
    )
    args = parser.parse_args()

    cmd = build_args(args.output_dir, extra_nuitka_args=args.nuitka_arg)
    # cwd=backend so Nuitka resolves `app` and the alembic tree from the
    # application package directory, independent of the caller's CWD.
    print("Running:", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=BACKEND_DIR, check=True)
    print(
        f"OK: standalone build at {args.output_dir / (EXE_NAME + '.dist')} "
        f"— now run stage_dist.py to assemble the distributable folder.",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())