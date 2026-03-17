#!/usr/bin/env bash
set -euo pipefail

DISPLAY_ID="${IBKR_DISPLAY:-:99}"
X_SOCKET="/tmp/.X11-unix/X${DISPLAY_ID#:}"
LOG_DIR="${IBKR_RUNTIME_LOG_DIR:-/opt/ibkr-runtime/logs}"
MAX_WAIT_SECONDS="${IBKR_X_WAIT_SECONDS:-30}"

mkdir -p "${LOG_DIR}"

for _ in $(seq 1 "${MAX_WAIT_SECONDS}"); do
  if [ -S "${X_SOCKET}" ]; then
    break
  fi
  sleep 1
done

if [ ! -S "${X_SOCKET}" ]; then
  echo "[ibgateway-launch] X display ${DISPLAY_ID} did not become ready within ${MAX_WAIT_SECONDS}s" >&2
  exit 1
fi

export DISPLAY="${DISPLAY_ID}"
export HOME="${HOME:-/root}"

cd /opt/ibgateway
exec /opt/ibgateway/ibgateway >> "${LOG_DIR}/ibgateway.log" 2>&1
