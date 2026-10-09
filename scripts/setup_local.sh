#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
if [[ $(uname -s) == Darwin ]]; then
  VENV_DIR=${VENV_DIR:-"${PROJECT_ROOT}/backend/.venv_macos"}
else
  VENV_DIR=${VENV_DIR:-"${PROJECT_ROOT}/backend/.venv_host_lite"}
fi
cd "${PROJECT_ROOT}"
mkdir -p .demo-runtime
if [[ ! -x "${VENV_DIR}/bin/python" ]]; then
  if [[ -d "${VENV_DIR}" ]]; then
    echo "旧环境不可用：${VENV_DIR}。请设置 VENV_DIR 指向新目录，保留旧目录。" >&2; exit 1
  fi
  PYTHON_BIN=${PYTHON_BIN:-python3}
  if ! "${PYTHON_BIN}" -c 'import sys; assert sys.version_info >= (3,10)' 2>/dev/null; then
    BUNDLED_PYTHON="${HOME}/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3"
    if [[ -x "${BUNDLED_PYTHON}" ]]; then PYTHON_BIN="${BUNDLED_PYTHON}";
    else echo '需要 Python 3.10+，或设置 PYTHON_BIN。' >&2; exit 1; fi
  fi
  "${PYTHON_BIN}" -m venv "${VENV_DIR}"
fi
REQUIREMENTS=backend/requirements-host-lite.txt
if [[ $(uname -s) == Darwin ]]; then REQUIREMENTS=backend/requirements-host-lite-macos.lock.txt; fi
"${VENV_DIR}/bin/python" -m pip install --cache-dir .demo-runtime/pip-cache -r "${REQUIREMENTS}"
cd studio
npm ci --cache ../.demo-runtime/npm-cache --no-audit --no-fund
