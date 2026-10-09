#!/system/bin/sh
set -eu

MODE="${1:-text}"
PROMPT_FILE="${2:-}"
DEVICE_BASE="${GEDGE_QNN_BASE:-/data/local/tmp/sa8397-qnn}"
COMMON_DIR="${DEVICE_BASE}/common"
MODEL_PATH="${GEDGE_MODEL_PATH:-${DEVICE_BASE}/model.litertlm}"
LOG_DIR="${GEDGE_DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}"
LOG_FILE="${LOG_DIR}/llm_adapter.log"

mkdir -p "${LOG_DIR}"

if [ -z "${PROMPT_FILE}" ] || [ ! -f "${PROMPT_FILE}" ]; then
  echo "missing prompt file: ${PROMPT_FILE}" | tee -a "${LOG_FILE}" >&2
  exit 2
fi

if [ "${MODE}" = "vision" ] || [ "${MODE}" = "audio" ]; then
  BIN="${COMMON_DIR}/litert_lm_advanced_main"
  [ -x "${BIN}" ] || BIN="${DEVICE_BASE}/litert_lm_advanced_main"
else
  BIN="${COMMON_DIR}/litert_lm_main"
  [ -x "${BIN}" ] || BIN="${DEVICE_BASE}/litert_lm_main"
fi

if [ ! -x "${BIN}" ]; then
  echo "missing litert binary: ${BIN}" | tee -a "${LOG_FILE}" >&2
  exit 3
fi

if [ ! -f "${MODEL_PATH}" ]; then
  echo "missing model file: ${MODEL_PATH}" | tee -a "${LOG_FILE}" >&2
  exit 4
fi

STAMP="$(date '+%F %T' 2>/dev/null || echo unknown_time)"
echo "${STAMP} mode=${MODE} prompt_file=${PROMPT_FILE}" >> "${LOG_FILE}"

extract_answer() {
  local prompt_lines
  prompt_lines="$(wc -l < "${PROMPT_FILE}" | tr -d ' ')"
  printf '%s\n' "$1" | awk -v prompt_lines="${prompt_lines}" '
    BEGIN {capture=0; skipped=0; started=0}
    /^input_prompt:/ {capture=1; next}
    /^BenchmarkInfo:/ {capture=0}
    capture {
      if (skipped < prompt_lines) {
        skipped++
        next
      }
      if (!started && NF == 0) {
        next
      }
      started=1
      print
    }
  '
}

CMD="${BIN} --backend=cpu --model_path=${MODEL_PATH} --input_prompt_file=${PROMPT_FILE}"
if [ "${MODE}" = "vision" ]; then
  CMD="${CMD} --vision_backend=cpu --max_num_images=1"
fi
if [ "${MODE}" = "audio" ]; then
  CMD="${CMD} --audio_backend=cpu"
fi

OUTPUT="$(sh -c "LD_LIBRARY_PATH='${DEVICE_BASE}':'${COMMON_DIR}':\$LD_LIBRARY_PATH ${CMD}" 2>&1)" || STATUS=$?
STATUS="${STATUS:-0}"
ANSWER="$(extract_answer "${OUTPUT}")"

echo "${OUTPUT}" >> "${LOG_FILE}"
if [ -n "${ANSWER}" ]; then
  printf '%s\n' "${ANSWER}"
else
  printf '%s\n' "${OUTPUT}"
fi
exit "${STATUS}"
