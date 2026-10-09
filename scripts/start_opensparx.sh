#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OLLAMA_BIN=${OLLAMA_BIN:-"${PROJECT_ROOT}/tools/ollama-runtime/darwin/ollama"}
if [[ ! -x "${OLLAMA_BIN}" ]]; then OLLAMA_BIN=$(command -v ollama || true); fi
if [[ -z "${OLLAMA_BIN}" || ! -x "${OLLAMA_BIN}" ]]; then
  echo '缺少 Ollama：请按 docs/devops/05_macOS_Local.md 安装。' >&2; exit 1
fi
export OLLAMA_HOST=${OLLAMA_HOST:-127.0.0.1:11435}
export OLLAMA_MODELS=${OLLAMA_MODELS:-"${PROJECT_ROOT}/models/ollama-opensparx"}
export OLLAMA_KEEP_ALIVE=${OLLAMA_KEEP_ALIVE:-30m}
export OLLAMA_CONTEXT_LENGTH=${OLLAMA_CONTEXT_LENGTH:-8192}
export OLLAMA_NO_CLOUD=1
export OLLAMA_NOPRUNE=1
cd "${PROJECT_ROOT}"
exec "${OLLAMA_BIN}" serve
