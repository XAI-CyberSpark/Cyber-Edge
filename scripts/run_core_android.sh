#!/usr/bin/env bash
set -euo pipefail

ACTION=${1:-start}
DEVICE_DIR=${DEVICE_DIR:-/data/local/tmp/cyber_edge_agent_v25}
REMOTE_LOG="${DEVICE_DIR}/g-edge-core.log"
REMOTE_PID="${DEVICE_DIR}/g-edge-core.pid"

start() {
  adb shell "cd '${DEVICE_DIR}' && export LD_LIBRARY_PATH='${DEVICE_DIR}/lib':\$LD_LIBRARY_PATH && nohup ./g-edge-core --manifest '${DEVICE_DIR}/smart_cabin_v2.yaml' >'${REMOTE_LOG}' 2>&1 </dev/null & echo \$! >'${REMOTE_PID}'"
  echo "Started g-edge-core on device."
}

status() {
  adb shell "if [ -f '${REMOTE_PID}' ]; then PID=\$(cat '${REMOTE_PID}'); echo PID=\${PID}; fi; ps -A | grep g-edge-core || true"
}

stop() {
  adb shell "if [ -f '${REMOTE_PID}' ]; then kill \$(cat '${REMOTE_PID}') && rm -f '${REMOTE_PID}'; fi; pkill -f g-edge-core || true"
  echo "Stopped g-edge-core on device."
}

logs() {
  adb shell "tail -n 200 '${REMOTE_LOG}'"
}

case "${ACTION}" in
  start) start ;;
  status) status ;;
  stop) stop ;;
  logs) logs ;;
  *)
    echo "Usage: $0 {start|status|stop|logs}" >&2
    exit 1
    ;;
esac
