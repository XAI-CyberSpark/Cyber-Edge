#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ $(uname -s) == Darwin ]] || { echo '本脚本只安装 macOS Ollama'; exit 1; }
cd "${PROJECT_ROOT}"
mkdir -p .demo-runtime/downloads tools/ollama-runtime/darwin
ARCHIVE=.demo-runtime/downloads/ollama-darwin.tgz
DIGEST=dd12b00bcce2d6551178e67ada90d5af9f75bdb54a118b96655250fa3e8ef734
if ! echo "${DIGEST}  ${ARCHIVE}" | shasum -a 256 -c - >/dev/null 2>&1; then
  curl -fL --retry 3 --connect-timeout 15 https://github.com/ollama/ollama/releases/download/v0.34.0/ollama-darwin.tgz -o "${ARCHIVE}"
fi
echo "${DIGEST}  ${ARCHIVE}" | shasum -a 256 -c -
tar -xzf "${ARCHIVE}" -C tools/ollama-runtime/darwin
printf 'Ollama 0.34.0 已安装到项目 tools/ollama-runtime/darwin。\n'
