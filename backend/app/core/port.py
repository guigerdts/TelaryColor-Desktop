"""Dynamic port selection — avoids conflicts with dev servers.

TOCTOU note: there is an inherent race between find_free_port() and the
subsequent bind by uvicorn. Between those two calls another process could
claim the same port. This is acceptable for a local desktop app (single
user, short window) and the OS will refuse the bind with EADDRINUSE if
the race is lost. A production deploy would use a retry loop or bind
before starting the service, but that is out of scope here.
"""
import socket


def find_free_port(preferred: int = 8000) -> int:
    """Return preferred port if free, otherwise find a random free one."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            s.bind(("127.0.0.1", 0))
            return s.getsockname()[1]
