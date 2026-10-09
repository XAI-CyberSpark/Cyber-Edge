#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
START_SCRIPT="${PROJECT_ROOT}/scripts/start_local.sh"
STUDIO_URL="http://${STUDIO_HOST:-127.0.0.1}:${STUDIO_PORT:-5173}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "这个双击入口只适用于 macOS；请在终端运行 bash scripts/start_local.sh。" >&2
  exit 1
fi

if [[ ! -x "${START_SCRIPT}" ]]; then
  echo "找不到启动脚本：${START_SCRIPT}" >&2
  exit 1
fi

cleanup() {
  if [[ -n "${STACK_PID:-}" ]] && kill -0 "${STACK_PID}" 2>/dev/null; then
    kill -TERM "${STACK_PID}" 2>/dev/null || true
    wait "${STACK_PID}" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

echo "正在启动 OAKEgde Studio 开发环境…"
bash "${START_SCRIPT}" &
STACK_PID=$!

for _ in {1..60}; do
  if curl --silent --fail --max-time 2 "${STUDIO_URL}/" >/dev/null 2>&1; then
    open "${STUDIO_URL}" || true
    echo "Studio 已打开：${STUDIO_URL}"
    break
  fi
  if ! kill -0 "${STACK_PID}" 2>/dev/null; then
    wait "${STACK_PID}"
    exit 1
  fi
  sleep 1
done

if ! curl --silent --fail --max-time 2 "${STUDIO_URL}/" >/dev/null 2>&1; then
  echo "启动超过 60 秒仍未能访问 ${STUDIO_URL}。请查看 .demo-runtime/logs。" >&2
  exit 1
fi

wait "${STACK_PID}"
