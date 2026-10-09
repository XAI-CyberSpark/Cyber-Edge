#!/usr/bin/env sh
set -eu

mkdir -p /app/projects /app/pipelines /app/state

if [ -d /app/default-projects ] && [ -z "$(ls -A /app/projects 2>/dev/null)" ]; then
  cp -R /app/default-projects/. /app/projects/
fi

exec uvicorn main_host_lite:app --host 0.0.0.0 --port 8001
