"""Assemble the distributable folder — binary plus resources beside it.

One staging contract for BOTH freezers (design ADR-3, freezer-aware):

- Nuitka ``--standalone``   → ``<out>/telarycolor-server.dist/telarycolor-server[.exe]``
- PyInstaller ``--onedir``  → ``<distpath>/telarycolor-server/telarycolor-server[.exe]``

The script auto-detects either layout by existence, or is pinned
explicitly::

    backend/.venv/bin/python uitka-build/stage_dist.py                  # auto
    backend/.venv/bin/python uitka-build/stage_dist.py --freezer pyinstaller
    backend/.venv/bin/python uitka-build/stage_dist.py --exe dist/telarycolor-server/telarycolor-server.exe

It copies the frozen exe's siblings into the exe directory — ``alembic/``,
``alembic.ini``, ``frontend/dist`` — so ``app_base_dir()`` (exe dir) holds
every resource in both freezers. Resources are copied PHYSICALLY beside
the exe, never baked in (no ``--add-data``: PyInstaller 6 would bury them
in ``_internal/``).

No shell is ever spawned — pure ``pathlib``/``shutil`` (threat matrix).
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"

EXE_NAME = "telarycolor-server"
EXE_NAMES = (EXE_NAME, f"{EXE_NAME}.exe")


def _candidate_roots() -> list[Path]:
    """Directories that may contain a build output (deduped, order kept)."""
    roots = [REPO_ROOT, BACKEND_DIR]
    seen: set[Path] = set()
    return [r for r in roots if not (r in seen or seen.add(r))]


def _find_exe(root: Path, layout: str) -> Path | None:
    """Return the built exe path for one layout under one root, or None."""
    if layout == "nuitka":
        base = root / f"{EXE_NAME}.dist"
    else:
        base = root / "dist" / EXE_NAME
    if not base.is_dir():
        return None
    for name in EXE_NAMES:
        candidate = base / name
        if candidate.is_file():
            return candidate
    return None


def find_binary(freezer: str, explicit_exe: Path | None = None) -> Path:
    """Locate the built executable across every known layout.

    ``freezer`` is ``auto`` (probe Nuitka layout first, then PyInstaller),
    ``nuitka`` or ``pyinstaller``. ``--exe`` short-circuits detection.
    """
    if explicit_exe is not None:
        if not explicit_exe.is_file():
            raise SystemExit(f"FATAL: --exe not found: {explicit_exe}")
        return explicit_exe

    layouts = ["nuitka", "pyinstaller"] if freezer == "auto" else [freezer]
    for root in _candidate_roots():
        for layout in layouts:
            found = _find_exe(root, layout)
            if found is not None:
                print(f"Detected {layout} build: {found}", flush=True)
                return found
    raise SystemExit(
        "FATAL: no built executable found. Run compile.py (Nuitka) or "
        "compile_pyinstaller.py first, then re-run stage_dist.py. "
        "PyInstaller fallback: stage_dist.py --freezer pyinstaller "
        "(no script edit needed)."
    )


def _replace_tree(src: Path, dst: Path) -> None:
    """Copy a directory tree, replacing any stale destination first."""
    if dst.exists():
        shutil.rmtree(dst)
    shutil.copytree(src, dst)


def stage_resources(exe: Path, backend_dir: Path, frontend_dist: Path) -> list[Path]:
    """Copy ``alembic/``, ``alembic.ini`` and ``frontend/dist`` beside ``exe``.

    Returns the created paths. The exe itself stays where the freezer put
    it — only its siblings are assembled here.
    """
    exe_dir = exe.parent

    migrations = backend_dir / "alembic"
    ini_file = backend_dir / "alembic.ini"
    if not migrations.is_dir() or not ini_file.is_file():
        raise SystemExit(
            f"FATAL: expected {migrations} and {ini_file} beside the app; "
            f"cannot assemble a bootable bundle without them."
        )
    if not frontend_dist.is_dir() or not (frontend_dist / "index.html").is_file():
        raise SystemExit(
            f"FATAL: {frontend_dist} has no index.html; build the SPA "
            f"first (SPA staging is part of the bundle contract)."
        )

    created: list[Path] = []
    _replace_tree(migrations, exe_dir / "alembic")
    created.append(exe_dir / "alembic")
    shutil.copy2(ini_file, exe_dir / "alembic.ini")
    created.append(exe_dir / "alembic.ini")
    _replace_tree(frontend_dist, exe_dir / "frontend" / "dist")
    created.append(exe_dir / "frontend" / "dist")
    return created


def _folder_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--freezer",
        choices=["auto", "nuitka", "pyinstaller"],
        default="auto",
        help="Layout to probe. auto tries Nuitka layout then PyInstaller. "
        "'--freezer pyinstaller' is the documented CI fallback re-run.",
    )
    parser.add_argument(
        "--exe",
        type=Path,
        default=None,
        help="Explicit path to the built executable (skips detection).",
    )
    parser.add_argument(
        "--backend",
        type=Path,
        default=BACKEND_DIR,
        help="Backend dir holding alembic/ + alembic.ini (default: repo backend/).",
    )
    parser.add_argument(
        "--frontend-dist",
        type=Path,
        default=REPO_ROOT / "frontend" / "dist",
        help="SPA build to stage (default: repo frontend/dist).",
    )
    args = parser.parse_args()

    exe = find_binary(args.freezer, args.exe)
    created = stage_resources(exe, args.backend, args.frontend_dist)

    staged = exe.parent
    size_mb = _folder_size(staged) / (1024 * 1024)
    print(f"Staged folder: {staged}", flush=True)
    for path in created:
        print(f"  staged {path}", flush=True)
    print(f"Total staged size: {size_mb:.1f} MiB", flush=True)
    print("OK: distributable assembled — run smoke_binary.py / test_binary.sh.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())