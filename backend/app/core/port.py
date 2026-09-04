"""Dynamic port selection — avoids conflicts with dev servers."""
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
