#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $(uname -s) == Darwin ]]; then
  VENV_DIR=${VENV_DIR:-"${PROJECT_ROOT}/backend/.venv_macos"}
else
  VENV_DIR=${VENV_DIR:-"${PROJECT_ROOT}/backend/.venv_host_lite"}
fi
if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  echo 'Python 环境不可用。先运行 scripts/setup_local.sh。' >&2; exit 1
fi
export OLLAMA_BASE_URL=${OLLAMA_BASE_URL:-http://127.0.0.1:11435/v1}
export OPENSPARX_BASE_URL=${OPENSPARX_BASE_URL:-http://127.0.0.1:11435/v1}
cd "${PROJECT_ROOT}/backend"
exec "${VENV_DIR}/bin/python" -m uvicorn main_host_lite:app --host "${BACKEND_HOST:-127.0.0.1}" --port "${BACKEND_PORT:-8000}"
