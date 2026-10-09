#!/usr/bin/env bash
set -euo pipefail
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "${PROJECT_ROOT}/studio"
if [[ ! -d node_modules ]]; then
  echo '前端依赖未安装。先运行 scripts/setup_local.sh。' >&2; exit 1
fi
exec npm run dev -- --host "${STUDIO_HOST:-127.0.0.1}" --port "${STUDIO_PORT:-5173}" --strictPort
