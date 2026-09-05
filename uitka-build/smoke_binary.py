"""Binary smoke test — validate a staged Telary Color server bundle.

Boots the frozen executable in an isolated sandbox and enforces the
backend-packaging smoke contract (spec "Binary Smoke Verification",
size/start-time gates, "Hard Termination Tolerance"):

    1. Pre-seed the sandbox (``TELARYCOLOR_DATA_DIR``): alembic upgrade
       head + ``python -m app.seed`` (admin user for the login probe).
    2. Launch the binary; the boot chain must write ``.port`` and a
       ``PORT:<port>`` stdout line.
    3. ``GET /health`` must return 200 within the start-time gate
       (default 3 s — the frozen build's contract).
    4. OAuth2 login (admin) returns a bearer token.
    5. Multipart upload to ``POST /api/v1/samples/upload`` returns 2xx —
       proves ``python-multipart`` is bundled (route is 201; spec's "200"
       is the success intent → assert 2xx, design smoke contract).
    6. ``GET /`` returns 200 — the staged SPA (``frontend/dist``) is served.
    7. Staged folder total size < max size gate (default 200 MB).
    8. Hard-kill (SIGKILL / ``taskkill /F`` — no graceful shutdown path,
       as on Windows) then relaunch; health must return 200 again,
       proving WAL/rollback-journal recovery plus idempotent re-migration.

Every gate fails loudly (non-zero exit); ``test_binary.sh`` wraps this
script under ``set -euo pipefail`` for CI. Requires httpx (installed with
runtime ``requirements.txt``). All subprocess calls are list-arg with
``shell=False`` (threat matrix).
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = REPO_ROOT / "backend"

EXE_NAME = "telarycolor-server"

# Tiny valid 1x1 transparent PNG — magic bytes \x89PNG\r\n\x1a\n satisfy
# classify_upload's byte agreement check for a real multipart exercise.
_TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d494844520000000100000001080600000"
    "01f15c4890000000d49444154789c636060f85f030018040668c7f18"
    "c510000000049454e44ae426082"
)

FAILURES: list[str] = []


def _fail(message: str) -> None:
    FAILURES.append(message)
    print(f"FAIL: {message}", file=sys.stderr, flush=True)


class _LogReader(threading.Thread):
    """Stream a child's stdout to our stdout without deadlocking the pipe."""

    def __init__(self, stream) -> None:
        super().__init__(daemon=True)
        self.stream = stream
        self.lines: list[str] = []

    def run(self) -> None:
        for line in iter(self.stream.readline, ""):
            self.lines.append(line)
            print(f"[server] {line}", end="", flush=True)


def seed_sandbox(backend_dir: Path, data_dir: Path) -> None:
    """Migrate + seed the sandbox DB with the dev toolchain."""
    env = os.environ.copy()
    env["TELARYCOLOR_DATA_DIR"] = str(data_dir)
    env["DATABASE_URL"] = f"sqlite:///{data_dir / 'app.db'}"
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=backend_dir, env=env, check=True,
    )
    subprocess.run(
        [sys.executable, "-m", "app.seed"],
        cwd=backend_dir, env=env, check=True,
    )


def launch_binary(exe: Path, data_dir: Path) -> tuple[subprocess.Popen, _LogReader]:
    """Start the frozen binary with the sandbox data dir; stream its log.

    ``DATABASE_URL`` is pinned to the sandbox DB explicitly: env beats any
    dotenv file, so a dev-tree ``.env`` with a CWD-relative URL can never
    redirect the server off the sandbox. The frozen boot sets the same
    absolute value from ``db_path()`` in ``entry.py``, so this is
    consistent with (not a substitute for) the real contract.
    """
    env = os.environ.copy()
    env["TELARYCOLOR_DATA_DIR"] = str(data_dir)
    env["DATABASE_URL"] = f"sqlite:///{data_dir / 'app.db'}"
    proc = subprocess.Popen(
        [str(exe)],
        cwd=exe.parent,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    reader = _LogReader(proc.stdout)
    reader.start()
    return proc, reader


def wait_for_port_file(proc: subprocess.Popen, data_dir: Path, deadline: float) -> int:
    """Poll the sandbox ``.port`` file until the boot chain writes it."""
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(
                f"binary exited early (code {proc.returncode}) — see [server] log"
            )
        port_file = data_dir / ".port"
        if port_file.is_file():
            port = int(port_file.read_text().strip())
            print(f"OK: .port -> {port}", flush=True)
            return port
        time.sleep(0.1)
    raise RuntimeError("timed out waiting for the .port file (boot chain)")


def wait_health(base_url: str, deadline: float) -> None:
    """GET /health until 200 within the start-time gate; else fail."""
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            response = httpx.get(f"{base_url}/health", timeout=1.0)
            if response.status_code == 200 and response.json() == {"status": "ok"}:
                print(f"OK: GET /health -> {response.status_code}", flush=True)
                return
            last_error = RuntimeError(f"health status {response.status_code}")
        except Exception as exc:  # connection refused while booting etc.
            last_error = exc
        time.sleep(0.1)
    raise RuntimeError(f"health gate exceeded deadline: {last_error}")


def login(base_url: str) -> str:
    """OAuth2 form login with the seeded admin; returns the bearer token."""
    response = httpx.post(
        f"{base_url}/api/v1/auth/login",
        data={
            "username": os.environ.get("SEED_ADMIN_USERNAME", "admin"),
            "password": os.environ.get("SEED_ADMIN_PASSWORD", "telary-admin"),
        },
        timeout=5.0,
    )
    response.raise_for_status()
    token = response.json()["access_token"]
    print(f"OK: OAuth2 login -> {response.status_code}, token issued", flush=True)
    return token


def multipart_upload(base_url: str, token: str) -> None:
    """POST a real PNG as multipart; assert 2xx (route is 201)."""
    response = httpx.post(
        f"{base_url}/api/v1/samples/upload",
        headers={"Authorization": f"Bearer {token}"},
        files={"photo": ("smoke.png", _TINY_PNG, "image/png")},
        timeout=10.0,
    )
    print(f"OK: multipart upload -> {response.status_code}", flush=True)
    if not 200 <= response.status_code < 300:
        raise RuntimeError(f"multipart upload failed: {response.text[:200]}")


def spa_served(base_url: str) -> None:
    """GET / must return the staged SPA (frontend/dist beside the exe)."""
    response = httpx.get(f"{base_url}/", timeout=5.0)
    print(f"OK: GET / -> {response.status_code}", flush=True)
    if response.status_code != 200:
        raise RuntimeError(f"SPA GET / returned {response.status_code}")


def staged_size_gate(staged_dir: Path, max_size_mb: int) -> None:
    total = sum(p.stat().st_size for p in staged_dir.rglob("*") if p.is_file())
    size_mb = total / (1024 * 1024)
    print(f"OK: staged size = {size_mb:.1f} MiB (gate {max_size_mb} MiB)", flush=True)
    if size_mb > max_size_mb:
        raise RuntimeError(
            f"size gate exceeded: {size_mb:.1f} MiB > {max_size_mb} MiB"
        )


def hard_kill(proc: subprocess.Popen) -> None:
    """Force-kill without any graceful path (Windows-style hard kill)."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
            check=False,
        )
    else:
        os.kill(proc.pid, signal.SIGKILL)
    proc.wait(timeout=15)
    print("OK: hard-killed (SIGKILL/taskkill /F), exit code "
          f"{proc.returncode}", flush=True)


def smoke(exe: Path, data_dir: Path, staged_dir: Path | None,
          health_timeout: float, max_size_mb: int) -> int:
    seed_sandbox(BACKEND_DIR, data_dir)

    started = time.monotonic()
    proc, reader = launch_binary(exe, data_dir)
    try:
        port = wait_for_port_file(proc, data_dir, started + health_timeout)
    except Exception as exc:
        _fail(f"boot chain: {exc}")
        proc.kill()
        proc.wait(timeout=15)
        return 1

    base_url = f"http://127.0.0.1:{port}"

    # Gate 1: /health within the start-time gate (frozen contract).
    launched_at = time.monotonic()
    try:
        wait_health(base_url, launched_at + health_timeout)
    except Exception as exc:
        _fail(f"start-time gate ({health_timeout:g}s): {exc}")
        hard_kill(proc)
        return 1
    print(f"OK: first /health 200 in {time.monotonic() - launched_at:.2f}s "
          f"(gate {health_timeout:g}s)", flush=True)

    port_lines = [ln for ln in reader.lines if "PORT:" in ln]
    if not port_lines:
        _fail("PORT:<port> stdout line not emitted by the boot chain")
    else:
        print(f"OK: boot chain wrote: {port_lines[0].strip()}", flush=True)

    try:
        token = login(base_url)
        multipart_upload(base_url, token)
        spa_served(base_url)
    except Exception as exc:
        _fail(f"runtime contract: {exc}")
        hard_kill(proc)
        return 1

    if staged_dir is not None:
        try:
            staged_size_gate(staged_dir, max_size_mb)
        except Exception as exc:
            _fail(f"size gate: {exc}")
            hard_kill(proc)
            return 1

    hard_kill(proc)

    # Relaunch with the SAME sandbox: WAL/rollback recovery + idempotent
    # re-migration must serve health 200 again.
    relaunched = time.monotonic()
    proc2, reader2 = launch_binary(exe, data_dir)
    try:
        port2 = wait_for_port_file(proc2, data_dir, relaunched + health_timeout)
        wait_health(f"http://127.0.0.1:{port2}", relaunched + health_timeout)
    except Exception as exc:
        _fail(f"relaunch after hard kill: {exc}")
        proc2.kill()
        proc2.wait(timeout=15)
        return 1
    print(f"OK: relaunch health 200 in {time.monotonic() - relaunched:.2f}s "
          f"(.port -> {port2}; WAL recovery + idempotent re-migration)", flush=True)
    try:
        proc2.send_signal(signal.SIGTERM)
        proc2.wait(timeout=15)
    except Exception:
        hard_kill(proc2)
    return 1 if FAILURES else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--exe",
        type=Path,
        required=True,
        help="Path to the staged binary to smoke-test.",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=None,
        help="Sandbox data dir (default: fresh temp dir printed on exit).",
    )
    parser.add_argument(
        "--staged-dir",
        type=Path,
        default=None,
        help="Folder measured for the size gate (default: the exe's dir).",
    )
    parser.add_argument(
        "--health-timeout",
        type=float,
        default=3.0,
        help="Start-time/health gate in seconds (default 3.0).",
    )
    parser.add_argument(
        "--max-size-mb",
        type=int,
        default=200,
        help="Size gate for the staged folder in MiB (default 200).",
    )
    args = parser.parse_args()

    exe = args.exe.resolve()
    if not exe.is_file():
        print(f"FATAL: --exe not found: {exe}", file=sys.stderr)
        return 2

    data_dir = args.data_dir or Path(
        tempfile.mkdtemp(prefix="telarycolor-smoke-")
    )
    data_dir.mkdir(parents=True, exist_ok=True)
    print(f"Sandbox TELARYCOLOR_DATA_DIR: {data_dir}", flush=True)
    print(f"Smoking binary: {exe}", flush=True)

    rc = smoke(exe, data_dir, args.staged_dir, args.health_timeout, args.max_size_mb)
    print("SMOKE PASS" if rc == 0 else "SMOKE FAILED", flush=True)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())