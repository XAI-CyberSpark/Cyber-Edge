#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "${SCRIPT_DIR}/.." && pwd)
ACTION=${1:-run}
DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}
REMOTE_OUTPUT="${DEVICE_DIR}/runtime_result.json"
REMOTE_STDOUT="${DEVICE_DIR}/runtime_stdout.log"
REMOTE_NODE_LOG="${DEVICE_DIR}/runtime_nodes_latest.log"
QNN_BASE=${QNN_BASE:-"${DEVICE_DIR}/models/gemma4-cpu-sa8397"}
LEGACY_QNN_BASE=${LEGACY_QNN_BASE:-/data/local/tmp/sa8397-qnn}
CAR_CTRL_MODE=${CAR_CTRL_MODE:-placeholder}
CAR_CTRL_BASE_URL=${CAR_CTRL_BASE_URL:-http://<device-ip>:8080}
LOCAL_INPUT_JSON=${LOCAL_INPUT_JSON:-"${PROJECT_ROOT}/dist/sa8397_runtime/runtime_input.json"}
PYTHON_BIN=${PYTHON_BIN:-python3}
ADB_SERIAL=${ADB_SERIAL:-}

adb_cmd() {
  if [[ -n "${ADB_SERIAL}" ]]; then
    adb -s "${ADB_SERIAL}" "$@"
  else
    adb "$@"
  fi
}

run_runtime() {
  adb_cmd shell "cd '${DEVICE_DIR}' && export GEDGE_DEVICE_DIR='${DEVICE_DIR}' && export GEDGE_QNN_BASE='${QNN_BASE}' && if [ ! -d '${QNN_BASE}' ]; then export GEDGE_QNN_BASE='${LEGACY_QNN_BASE}'; fi && export GEDGE_CAR_CTRL_BASE_URL='${CAR_CTRL_BASE_URL}' && export GEDGE_CAR_CTRL_MODE='${CAR_CTRL_MODE}' && export LD_LIBRARY_PATH='${DEVICE_DIR}':\$LD_LIBRARY_PATH && ./sa8397_runtime --graph '${DEVICE_DIR}/flow.json' --input '${DEVICE_DIR}/input.json' --output '${REMOTE_OUTPUT}' --llm-script '${DEVICE_DIR}/llm_adapter.sh' --action-script '${DEVICE_DIR}/action_adapter.sh' >'${REMOTE_STDOUT}' 2>&1"
  adb_cmd shell "grep '^\[runtime\] node=' '${REMOTE_STDOUT}' > '${REMOTE_NODE_LOG}' || :"
}

push_input_json() {
  local source_json="$1"
  adb_cmd push "${source_json}" "${DEVICE_DIR}/input.json"
}

write_text_input_json() {
  local user_text="$1"
  local source_name="${2:-host_manual_input}"
  mkdir -p "$(dirname "${LOCAL_INPUT_JSON}")"
  "${PYTHON_BIN}" - "$LOCAL_INPUT_JSON" "$user_text" "$source_name" <<'PY'
import json
import sys
from pathlib import Path

output_path = Path(sys.argv[1])
text = sys.argv[2]
source = sys.argv[3]
payload = {
    "text": text,
    "source": source,
}
output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(output_path)
PY
}

show_logs() {
  adb_cmd shell "echo '--- runtime_stdout.log ---'; cat '${REMOTE_STDOUT}' 2>/dev/null || true; echo; echo '--- runtime_result.json ---'; cat '${REMOTE_OUTPUT}' 2>/dev/null || true; echo; echo '--- llm_adapter.log ---'; cat '${DEVICE_DIR}/llm_adapter.log' 2>/dev/null || true; echo; echo '--- action_adapter.log ---'; cat '${DEVICE_DIR}/action_adapter.log' 2>/dev/null || true"
}

show_latest_node_logs() {
  adb_cmd shell "echo '--- runtime_nodes_latest.log ---'; cat '${REMOTE_NODE_LOG}' 2>/dev/null || echo 'missing ${REMOTE_NODE_LOG}'"
}

show_brief_logs() {
  local tmp_json
  tmp_json="$(mktemp)"
  adb_cmd shell "cat '${REMOTE_OUTPUT}' 2>/dev/null || true" > "${tmp_json}"
  if [[ ! -s "${tmp_json}" ]]; then
    echo "missing ${REMOTE_OUTPUT}" >&2
    rm -f "${tmp_json}"
    exit 1
  fi
  "${PYTHON_BIN}" - "${tmp_json}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
data = json.loads(path.read_text(encoding="utf-8"))
logs = data.get("execution_log", [])

print("--- brief_runtime_summary ---")
for entry in logs:
    node_id = entry.get("node_id", "")
    node_type = entry.get("type", "")
    label = entry.get("label", "")
    print(f"[{node_type}] {label} ({node_id})")

print()
llm_entry = next((x for x in logs if x.get("type") == "llm"), None)
if llm_entry:
    llm_output = json.loads(llm_entry["output"])
    print("--- llm_output ---")
    print(llm_output.get("llm_output", ""))
    print()
    print("--- llm_actions ---")
    print(json.dumps(llm_output.get("actions", []), ensure_ascii=False, indent=2))
    print()

car_entries = [x for x in logs if x.get("type") == "car_control"]
for index, car_entry in enumerate(car_entries, start=1):
    car_output = json.loads(car_entry["output"])
    print(f"--- car_control_{index} ---")
    print("planned_action:")
    print(json.dumps(car_output.get("planned_action", {}), ensure_ascii=False, indent=2))
    print("normalized_config:")
    print(json.dumps(car_output.get("normalized_config", {}), ensure_ascii=False, indent=2))
    print("adapter_output:")
    adapter_output = car_output.get("adapter_output", "{}")
    try:
        adapter_output = json.loads(adapter_output)
    except Exception:
        pass
    if isinstance(adapter_output, dict):
        print(json.dumps(adapter_output, ensure_ascii=False, indent=2))
    else:
        print(adapter_output)
    print()
PY
  rm -f "${tmp_json}"
}

case "${ACTION}" in
  run) run_runtime ;;
  run-text)
    if [[ $# -lt 2 ]]; then
      echo "Usage: $0 run-text \"your input\" [source]" >&2
      exit 1
    fi
    write_text_input_json "$2" "${3:-host_manual_input}"
    push_input_json "${LOCAL_INPUT_JSON}"
    run_runtime
    ;;
  run-json)
    if [[ $# -lt 2 ]]; then
      echo "Usage: $0 run-json /absolute/path/to/input.json" >&2
      exit 1
    fi
    push_input_json "$2"
    run_runtime
    ;;
  logs) show_logs ;;
  logs-nodes|logs-latest)
    show_latest_node_logs
    ;;
  logs-brief)
    show_brief_logs
    ;;
  *)
    echo "Usage: $0 {run|run-text|run-json|logs|logs-nodes|logs-latest|logs-brief}" >&2
    exit 1
    ;;
esac
