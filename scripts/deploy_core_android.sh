#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
DIST_DIR="${PROJECT_ROOT}/dist/sa8397"
DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}

if [[ ! -f "${DIST_DIR}/bin/g-edge-core" ]]; then
  echo "Missing build artifact: ${DIST_DIR}/bin/g-edge-core" >&2
  echo "Run scripts/build_core_android.sh first." >&2
  exit 1
fi

adb shell "mkdir -p '${DEVICE_DIR}/lib'"
adb push "${DIST_DIR}/bin/g-edge-core" "${DEVICE_DIR}/g-edge-core"
adb push "${DIST_DIR}/manifests/smart_cabin_v2.yaml" "${DEVICE_DIR}/smart_cabin_v2.yaml"

if find "${DIST_DIR}/lib" -maxdepth 1 -type f | grep -q .; then
  adb push "${DIST_DIR}/lib/." "${DEVICE_DIR}/lib/"
fi

adb shell "chmod 755 '${DEVICE_DIR}/g-edge-core'"
adb shell "ls -l '${DEVICE_DIR}' && ls -l '${DEVICE_DIR}/lib' || true"

echo "Artifacts deployed to ${DEVICE_DIR}"
