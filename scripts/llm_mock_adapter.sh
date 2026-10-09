#!/system/bin/sh
set -eu

PLAN_PATH="${GEDGE_LLM_MOCK_PLAN_PATH:-${GEDGE_DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}/llm_mock_plan.json}"

if [ ! -f "${PLAN_PATH}" ]; then
  echo "{\"reply\":\"mock plan missing\",\"actions\":[]}" >&2
  exit 2
fi

cat "${PLAN_PATH}"
