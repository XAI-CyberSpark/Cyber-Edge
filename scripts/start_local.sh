#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $(uname -s) == Darwin ]]; then
  VENV_DIR=${VENV_DIR:-"${PROJECT_ROOT}/backend/.venv_macos"}
else
  VENV_DIR=${VENV_DIR:-"${PROJECT_ROOT}/backend/.venv_host_lite"}
fi
exec "${VENV_DIR}/bin/python" "${PROJECT_ROOT}/scripts/local_services.py"
