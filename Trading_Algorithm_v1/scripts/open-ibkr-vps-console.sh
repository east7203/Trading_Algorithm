#!/usr/bin/env bash
set -euo pipefail

SSH_KEY="${DEPLOY_KEY:-$HOME/.ssh/trading_vps}"
REMOTE_HOST="${DEPLOY_HOST:-root@167.172.252.171}"
LOCAL_PORT="${IBKR_VPS_LOCAL_PORT:-6080}"
REMOTE_PORT="${IBKR_VPS_REMOTE_PORT:-6080}"
URL="http://127.0.0.1:${LOCAL_PORT}/vnc.html?autoconnect=1&resize=scale&view_clip=1&path=websockify"

echo "Opening IBKR VPS console at ${URL}"
echo "Keep this terminal open while you use the remote IB Gateway session."

ssh -i "${SSH_KEY}" -N -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" "${REMOTE_HOST}" &
TUNNEL_PID=$!

cleanup() {
  if kill -0 "${TUNNEL_PID}" >/dev/null 2>&1; then
    kill "${TUNNEL_PID}" >/dev/null 2>&1 || true
    wait "${TUNNEL_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

sleep 2
open "${URL}"

wait "${TUNNEL_PID}"
