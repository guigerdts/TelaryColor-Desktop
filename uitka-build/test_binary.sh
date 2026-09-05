#!/usr/bin/env bash
# Binary smoke test wrapper (backend-packaging spec artifact).
# Runs smoke_binary.py under `set -euo pipefail` so any gate failure
# aborts the CI job. Requires: backend/.venv (or the PYTHON env var) with
# requirements.txt installed (httpx) and a staged build already assembled.
#
#   bash uitka-build/test_binary.sh --exe telarycolor-server.dist/telarycolor-server
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PY="${PYTHON:-}"
if [ -z "${PY}" ]; then
  if [ -x "${REPO_ROOT}/backend/.venv/bin/python" ]; then
    PY="${REPO_ROOT}/backend/.venv/bin/python"
  elif [ -x "${REPO_ROOT}/backend/.venv/Scripts/python.exe" ]; then
    PY="${REPO_ROOT}/backend/.venv/Scripts/python.exe"
  else
    PY="python3"
  fi
fi

exec "${PY}" "${SCRIPT_DIR}/smoke_binary.py" "$@"