#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
DIST_RUNTIME="${PROJECT_ROOT}/dist/sa8397_runtime"
OUTPUT_DIR=${OUTPUT_DIR:-"${PROJECT_ROOT}/dist/sa8397_bundle"}
BUNDLE_NAME=${BUNDLE_NAME:-"sa8397_bundle_$(date +%Y%m%d_%H%M%S)"}
FLOW_JSON=${FLOW_JSON:-"${PROJECT_ROOT}/backend/projects/flow.json"}
CURRENT_PROJECT_NAME=${CURRENT_PROJECT_NAME:-"${BUNDLE_NAME}"}
CURRENT_PROJECT_FILE_NAME=${CURRENT_PROJECT_FILE_NAME:-"${CURRENT_PROJECT_NAME}.json"}
INCLUDE_ALL_PROJECTS=${INCLUDE_ALL_PROJECTS:-1}
PACKAGE_MODELS=${PACKAGE_MODELS:-1}
MODEL_SOURCE=${MODEL_SOURCE:-}
DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}
ADB_SERIAL=${ADB_SERIAL:-}
CAR_CTRL_BASE_URL=${CAR_CTRL_BASE_URL:-http://<device-ip>:8080}
MODEL_DEST_REL="models/gemma4-cpu-sa8397"

if [[ ! -f "${FLOW_JSON}" ]]; then
  echo "Missing FLOW_JSON: ${FLOW_JSON}" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"
BUNDLE_DIR="${OUTPUT_DIR}/${BUNDLE_NAME}"
ARCHIVE_PATH="${OUTPUT_DIR}/${BUNDLE_NAME}.tar.gz"
rm -rf "${BUNDLE_DIR}" "${ARCHIVE_PATH}"
mkdir -p "${BUNDLE_DIR}/projects" "${BUNDLE_DIR}/docs/devops" "${BUNDLE_DIR}/models"

if [[ "${CURRENT_PROJECT_FILE_NAME}" != *.json ]]; then
  CURRENT_PROJECT_FILE_NAME="${CURRENT_PROJECT_FILE_NAME}.json"
fi

adb_cmd() {
  if [[ -n "${ADB_SERIAL}" ]]; then
    adb -s "${ADB_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

mark_model_binaries_executable() {
  local model_root="$1"
  if [[ ! -d "${model_root}" ]]; then
    return 0
  fi

  local candidates=(
    "${model_root}/litert_lm_main"
    "${model_root}/litert_lm_advanced_main"
    "${model_root}/common/litert_lm_main"
    "${model_root}/common/litert_lm_advanced_main"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      chmod 755 "${candidate}"
    fi
  done
}

echo "Preparing SA8397 bundle: ${BUNDLE_NAME}"
echo "Building runtime binaries..."
"${PROJECT_ROOT}/scripts/build_sa8397_runtime.sh"

echo "Copying runtime artifacts..."
cp "${DIST_RUNTIME}/sa8397_runtime" "${BUNDLE_DIR}/sa8397_runtime"
cp "${DIST_RUNTIME}/sa8397_runtime_host" "${BUNDLE_DIR}/sa8397_runtime_host"
cp "${DIST_RUNTIME}/libc++_shared.so" "${BUNDLE_DIR}/libc++_shared.so"
cp "${DIST_RUNTIME}/input.json" "${BUNDLE_DIR}/input.json"

echo "Copying runtime scripts..."
cp "${PROJECT_ROOT}/scripts/sa8397_action_adapter.sh" "${BUNDLE_DIR}/action_adapter.sh"
cp "${PROJECT_ROOT}/scripts/sa8397_llm_adapter.sh" "${BUNDLE_DIR}/llm_adapter.sh"
cp "${PROJECT_ROOT}/scripts/run_sa8397_runtime.sh" "${BUNDLE_DIR}/run_sa8397_runtime.sh"
cp "${PROJECT_ROOT}/scripts/deploy_sa8397_runtime.sh" "${BUNDLE_DIR}/deploy_sa8397_runtime.sh"
cp "${PROJECT_ROOT}/scripts/package_sa8397_bundle.sh" "${BUNDLE_DIR}/package_sa8397_bundle.sh"
chmod 755 "${BUNDLE_DIR}/sa8397_runtime" "${BUNDLE_DIR}/action_adapter.sh" "${BUNDLE_DIR}/llm_adapter.sh" "${BUNDLE_DIR}/run_sa8397_runtime.sh" "${BUNDLE_DIR}/deploy_sa8397_runtime.sh" "${BUNDLE_DIR}/package_sa8397_bundle.sh"

echo "Copying current flow..."
cp "${FLOW_JSON}" "${BUNDLE_DIR}/flow.json"
cp "${FLOW_JSON}" "${BUNDLE_DIR}/projects/${CURRENT_PROJECT_FILE_NAME}"

if [[ "${INCLUDE_ALL_PROJECTS}" == "1" ]]; then
  echo "Copying saved backend projects..."
  if compgen -G "${PROJECT_ROOT}/backend/projects/*.json" > /dev/null; then
    cp "${PROJECT_ROOT}"/backend/projects/*.json "${BUNDLE_DIR}/projects/"
  fi
fi

echo "Copying docs..."
cp "${PROJECT_ROOT}/README.md" "${BUNDLE_DIR}/README.md"
cp "${PROJECT_ROOT}/Atomic_service_car_control_http_api.md" "${BUNDLE_DIR}/docs/Atomic_service_car_control_http_api.md"
cp "${PROJECT_ROOT}/docs/devops/03_SA8397_ADB_Deployment_Log.md" "${BUNDLE_DIR}/docs/devops/03_SA8397_ADB_Deployment_Log.md"

if [[ "${PACKAGE_MODELS}" == "1" ]]; then
  if [[ -z "${MODEL_SOURCE}" ]]; then
    echo "MODEL_SOURCE is required when PACKAGE_MODELS=1. Example: /abs/path/to/sa8397-qnn or adb:/data/local/tmp/sa8397-qnn" >&2
    exit 2
  fi
  echo "Copying Gemma4/QNN assets from ${MODEL_SOURCE} ..."
  if [[ "${MODEL_SOURCE}" == adb:* ]]; then
    adb_cmd pull "${MODEL_SOURCE#adb:}" "${BUNDLE_DIR}/${MODEL_DEST_REL}"
  else
    if [[ ! -e "${MODEL_SOURCE}" ]]; then
      echo "MODEL_SOURCE does not exist: ${MODEL_SOURCE}" >&2
      exit 3
    fi
    cp -a "${MODEL_SOURCE}" "${BUNDLE_DIR}/${MODEL_DEST_REL}"
  fi
  echo "Marking Gemma4/QNN launcher binaries as executable inside bundle..."
  mark_model_binaries_executable "${BUNDLE_DIR}/${MODEL_DEST_REL}"
fi

echo "Generating manifest.json ..."
env BUNDLE_DIR="${BUNDLE_DIR}" \
  BUNDLE_NAME="${BUNDLE_NAME}" \
  CURRENT_PROJECT_NAME="${CURRENT_PROJECT_NAME}" \
  CURRENT_PROJECT_FILE_NAME="${CURRENT_PROJECT_FILE_NAME}" \
  DEVICE_DIR="${DEVICE_DIR}" \
  CAR_CTRL_BASE_URL="${CAR_CTRL_BASE_URL}" \
  MODEL_DEST_REL="${MODEL_DEST_REL}" \
  MODEL_SOURCE="${MODEL_SOURCE}" \
  PACKAGE_MODELS="${PACKAGE_MODELS}" \
  python3 - <<'PY'
import json
import os
import time
from pathlib import Path

bundle_dir = Path(os.environ["BUNDLE_DIR"])
projects_dir = bundle_dir / "projects"
project_files = sorted(path.name for path in projects_dir.glob("*.json"))
models_dir = bundle_dir / os.environ["MODEL_DEST_REL"]
manifest = {
    "format_version": "sa8397_bundle.v1",
    "bundle_name": os.environ["BUNDLE_NAME"],
    "generated_at": time.time(),
    "entry_project": {
        "name": os.environ["CURRENT_PROJECT_NAME"],
        "file_name": os.environ["CURRENT_PROJECT_FILE_NAME"],
        "flow_entry": "flow.json",
    },
    "projects": project_files,
    "defaults": {
        "device_dir": os.environ["DEVICE_DIR"],
        "qnn_base": os.environ["MODEL_DEST_REL"] if models_dir.exists() else "/data/local/tmp/sa8397-qnn",
        "car_ctrl_base_url": os.environ["CAR_CTRL_BASE_URL"],
        "car_ctrl_mode": "placeholder",
    },
    "runtime": {
        "android_binary": "sa8397_runtime",
        "host_binary": "sa8397_runtime_host",
        "libcxx": "libc++_shared.so",
    },
    "scripts": [
        "run_sa8397_runtime.sh",
        "deploy_sa8397_runtime.sh",
        "package_sa8397_bundle.sh",
        "action_adapter.sh",
        "llm_adapter.sh",
    ],
    "docs": [
        "README.md",
        "docs/Atomic_service_car_control_http_api.md",
        "docs/devops/03_SA8397_ADB_Deployment_Log.md",
    ],
    "models": [
        {
            "id": "gemma4-cpu-sa8397",
            "included": models_dir.exists(),
            "path": os.environ["MODEL_DEST_REL"] if models_dir.exists() else "",
            "source": os.environ.get("MODEL_SOURCE", ""),
        }
    ],
}
(bundle_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
PY

echo "Creating archive..."
tar -czf "${ARCHIVE_PATH}" -C "${OUTPUT_DIR}" "${BUNDLE_NAME}"

echo "Bundle ready: ${BUNDLE_DIR}"
echo "Archive ready: ${ARCHIVE_PATH}"
