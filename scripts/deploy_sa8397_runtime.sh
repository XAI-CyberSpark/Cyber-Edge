#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
DIST_DIR="${PROJECT_ROOT}/dist/sa8397_runtime"
DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}
FLOW_JSON=${FLOW_JSON:-"${PROJECT_ROOT}/backend/projects/flow.json"}
INPUT_JSON=${INPUT_JSON:-"${DIST_DIR}/input.json"}
ADB_SERIAL=${ADB_SERIAL:-}

adb_cmd() {
  if [[ -n "${ADB_SERIAL}" ]]; then
    adb -s "${ADB_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

if [[ ! -f "${DIST_DIR}/sa8397_runtime" ]]; then
  echo "Missing Android runtime binary: ${DIST_DIR}/sa8397_runtime" >&2
  echo "Run scripts/build_sa8397_runtime.sh first." >&2
  exit 1
fi

if [[ ! -f "${FLOW_JSON}" ]]; then
  FLOW_JSON="${DIST_DIR}/flow.json"
fi

if [[ ! -f "${FLOW_JSON}" ]]; then
  echo "Missing flow file. Checked: ${PROJECT_ROOT}/backend/projects/flow.json and ${DIST_DIR}/flow.json" >&2
  exit 1
fi

if [[ ! -f "${INPUT_JSON}" ]]; then
  INPUT_JSON="${DIST_DIR}/input.json"
fi

adb_cmd shell "mkdir -p '${DEVICE_DIR}'"
adb_cmd push "${DIST_DIR}/sa8397_runtime" "${DEVICE_DIR}/sa8397_runtime"
adb_cmd push "${DIST_DIR}/libc++_shared.so" "${DEVICE_DIR}/libc++_shared.so"
adb_cmd push "${FLOW_JSON}" "${DEVICE_DIR}/flow.json"
adb_cmd push "${INPUT_JSON}" "${DEVICE_DIR}/input.json"
adb_cmd push "${PROJECT_ROOT}/scripts/sa8397_action_adapter.sh" "${DEVICE_DIR}/action_adapter.sh"
adb_cmd push "${PROJECT_ROOT}/scripts/sa8397_llm_adapter.sh" "${DEVICE_DIR}/llm_adapter.sh"
adb_cmd shell "chmod 755 '${DEVICE_DIR}/sa8397_runtime' '${DEVICE_DIR}/action_adapter.sh' '${DEVICE_DIR}/llm_adapter.sh'"

echo "Deployed runtime to ${DEVICE_DIR}"
echo "Flow source: ${FLOW_JSON}"
echo "Input source: ${INPUT_JSON}"
