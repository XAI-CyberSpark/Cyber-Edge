#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
DEPLOY_DIR="${PROJECT_ROOT}/deploy/production"
ENV_FILE="${DEPLOY_DIR}/.env"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker 未安装，请先安装 Docker。" >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose 不可用，请先安装 Docker Compose v2。" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "缺少 ${ENV_FILE}，请先从 deploy/production/.env.example 复制并填写 DOMAIN。" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

if [[ -z "${DOMAIN:-}" ]]; then
  echo "DOMAIN 不能为空，请在 ${ENV_FILE} 中填写正式域名。" >&2
  exit 1
fi

mkdir -p \
  "${DEPLOY_DIR}/data/projects" \
  "${DEPLOY_DIR}/data/pipelines" \
  "${DEPLOY_DIR}/data/state"

if [[ -z "$(find "${DEPLOY_DIR}/data/projects" -maxdepth 1 -name '*.json' -print -quit 2>/dev/null)" ]]; then
  cp -R "${PROJECT_ROOT}/backend/projects/." "${DEPLOY_DIR}/data/projects/"
fi

docker compose --env-file "${ENV_FILE}" -f "${DEPLOY_DIR}/docker-compose.yml" up -d --build

echo
echo "OAKEgde Studio 已启动。"
echo "如果 DNS 已指向当前主机，请访问: https://${DOMAIN}/"
