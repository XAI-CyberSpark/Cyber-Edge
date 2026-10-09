#!/system/bin/sh
set -eu

KIND="${1:-unknown}"
NAME="${2:-unknown}"
PARAMETER="${3:-}"
STAMP="$(date '+%F %T' 2>/dev/null || echo unknown_time)"
LOG_DIR="${GEDGE_DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}"
LOG_FILE="${LOG_DIR}/action_adapter.log"
BASE_URL_TEMPLATE="http://<device-ip>:8080"
BASE_URL="${GEDGE_ACTION_BASE_URL:-${GEDGE_CAR_CTRL_BASE_URL:-${BASE_URL_TEMPLATE}}}"
TMP_RESPONSE="${LOG_DIR}/action_adapter_response.json"
MODE="${GEDGE_CAR_CTRL_MODE:-placeholder}"
ENDPOINT="${GEDGE_ACTION_ENDPOINT:-control}"
MODULE_NAME="${GEDGE_ACTION_MODULE:-}"
FUNCTION_NAME="${GEDGE_ACTION_FUNCTION:-}"
SIGNAL_KEY="${GEDGE_ACTION_SIGNAL_KEY:-}"
LEVEL="${GEDGE_ACTION_LEVEL:-}"
AREA="${GEDGE_ACTION_AREA:-}"
STATUS="${GEDGE_ACTION_STATUS:-}"
METHOD=""
API_PATH=""

mkdir -p "${LOG_DIR}"
echo "${STAMP} kind=${KIND} name=${NAME} parameter=${PARAMETER}" >> "${LOG_FILE}"
echo "mode=${MODE}" >> "${LOG_FILE}"

PAYLOAD="null"

json_error() {
  echo "{\"code\":-1,\"message\":\"$1\",\"data\":null}" | tee -a "${LOG_FILE}" >&2
}

legacy_fallback() {
  case "${NAME}" in
    windows)
      MODULE_NAME="vehicleControl"
      FUNCTION_NAME="set"
      SIGNAL_KEY="WINDOW_POSITION"
      AREA="0"
      case "${PARAMETER}" in
        open_all) STATUS="100" ;;
        close_all) STATUS="0" ;;
        *) STATUS="${PARAMETER:-0}" ;;
      esac
      ;;
    ambient_light)
      MODULE_NAME="light"
      FUNCTION_NAME="set"
      SIGNAL_KEY="AMBIENCE_LIGHT_SINGLE_COLOR"
      LEVEL="${PARAMETER:-32}"
      ;;
    seat_heat)
      MODULE_NAME="seat"
      FUNCTION_NAME="set"
      SIGNAL_KEY="SEAT_HEAT_STATUS_0"
      LEVEL="${PARAMETER:-1}"
      ;;
    sunshade)
      MODULE_NAME="vehicleControl"
      FUNCTION_NAME="set"
      SIGNAL_KEY="SUNSHADE_SLIDING_OPEN"
      AREA="1"
      if [ "${PARAMETER}" = "open" ]; then
        STATUS="1"
      else
        STATUS="0"
      fi
      ;;
  esac
}

build_control_payload() {
  case "${MODULE_NAME}" in
    seat|light|vehicleControl) ;;
    *)
      json_error "unsupported module: ${MODULE_NAME}"
      exit 10
      ;;
  esac

  case "${FUNCTION_NAME}" in
    subscribe|get|set) ;;
    *)
      json_error "unsupported function: ${FUNCTION_NAME}"
      exit 11
      ;;
  esac

  if [ -z "${SIGNAL_KEY}" ]; then
    json_error "signalKey is required"
    exit 12
  fi

  if [ "${FUNCTION_NAME}" = "set" ]; then
    if [ "${MODULE_NAME}" = "seat" ] || [ "${MODULE_NAME}" = "light" ]; then
      if [ -z "${LEVEL}" ]; then
        json_error "level is required for ${MODULE_NAME}.set"
        exit 13
      fi
      PAYLOAD=$(cat <<EOF
{"module":"${MODULE_NAME}","function":"set","params":{"signalKey":"${SIGNAL_KEY}","level":${LEVEL}}}
EOF
)
    else
      if [ -z "${STATUS}" ]; then
        json_error "status is required for vehicleControl.set"
        exit 14
      fi
      if [ -z "${AREA}" ]; then
        if [ "${SIGNAL_KEY}" = "SUNSHADE_SLIDING_OPEN" ]; then
          AREA="1"
        else
          AREA="0"
        fi
      fi
      PAYLOAD=$(cat <<EOF
{"module":"${MODULE_NAME}","function":"set","params":{"signalKey":"${SIGNAL_KEY}","area":${AREA},"status":${STATUS}}}
EOF
)
    fi
  else
    PAYLOAD=$(cat <<EOF
{"module":"${MODULE_NAME}","function":"${FUNCTION_NAME}","params":{"signalKey":"${SIGNAL_KEY}"}}
EOF
)
  fi

  METHOD="POST"
  API_PATH="/api/vehicle/control"
}

if [ "${KIND}" = "car_control" ]; then
  if [ "${ENDPOINT}" = "signals" ]; then
    METHOD="GET"
    API_PATH="/api/vehicle/signals"
  else
    if [ -z "${MODULE_NAME}" ] || [ -z "${FUNCTION_NAME}" ] || [ -z "${SIGNAL_KEY}" ]; then
      legacy_fallback
    fi
    build_control_payload
  fi
fi

if [ "${KIND}" = "tool" ]; then
  case "${NAME}" in
    call_phone)
      json_error "tool placeholder only: call_phone ${PARAMETER}"
      exit 6
      ;;
    *)
      json_error "unsupported tool mapping: ${NAME}"
      exit 7
      ;;
  esac
fi

if [ -z "${METHOD}" ] || [ -z "${API_PATH}" ]; then
  json_error "unsupported adapter invocation: kind=${KIND}"
  exit 8
fi

API_URL="${BASE_URL}${API_PATH}"
echo "method=${METHOD}" >> "${LOG_FILE}"
echo "api_url=${API_URL}" >> "${LOG_FILE}"
echo "payload=${PAYLOAD}" >> "${LOG_FILE}"
if [ "${MODE}" != "http" ]; then
  echo "{\"code\":0,\"message\":\"car control placeholder mode\",\"data\":{\"mode\":\"${MODE}\",\"baseUrl\":\"${BASE_URL}\",\"method\":\"${METHOD}\",\"path\":\"${API_PATH}\",\"payload\":${PAYLOAD}}}" | tee -a "${LOG_FILE}"
  exit 0
fi

if [ "${METHOD}" = "GET" ]; then
  if curl -sS --max-time 5 "${API_URL}" > "${TMP_RESPONSE}" 2>&1; then
    cat "${TMP_RESPONSE}" >> "${LOG_FILE}"
    cat "${TMP_RESPONSE}"
    exit 0
  fi
else
  if curl -sS --max-time 5 -H "Content-Type: application/json" -d "${PAYLOAD}" "${API_URL}" > "${TMP_RESPONSE}" 2>&1; then
    cat "${TMP_RESPONSE}" >> "${LOG_FILE}"
    cat "${TMP_RESPONSE}"
    exit 0
  fi
fi

cat "${TMP_RESPONSE}" >> "${LOG_FILE}"
cat "${TMP_RESPONSE}"
exit 9
