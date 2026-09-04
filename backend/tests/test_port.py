"""Tests for dynamic port selection (app.core.port)."""
import socket
from unittest.mock import patch

from app.core.port import find_free_port


def test_find_free_port_preferred_available():
    """When the preferred port is free, return it."""
    port = find_free_port(preferred=8000)
    assert port == 8000


def test_find_free_port_preferred_busy():
    """When the preferred port is busy, fall back to a random free port."""
    # Bind a temporary socket on port 8000 to make it "busy"
    blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    blocker.bind(("127.0.0.1", 8000))
    blocker.listen(1)
    try:
        port = find_free_port(preferred=8000)
        assert port != 8000
        assert port > 0
    finally:
        blocker.close()


def test_bind_address_is_localhost():
    """Security: port selection must bind 127.0.0.1, never 0.0.0.0."""
    with patch("socket.socket") as mock_cls:
        mock_sock = mock_cls.return_value.__enter__.return_value
        mock_sock.bind.return_value = None
        mock_sock.getsockname.return_value = ("127.0.0.1", 9999)

        find_free_port(preferred=8000)

        # First bind call (preferred) must use 127.0.0.1
        first_bind_call = mock_sock.bind.call_args_list[0]
        bind_addr = first_bind_call[0][0]  # ("127.0.0.1", port)
        assert bind_addr[0] == "127.0.0.1"
