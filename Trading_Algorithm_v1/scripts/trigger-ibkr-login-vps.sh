#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
START_DELAY_SECONDS="${IBKR_AUTOLOGIN_START_DELAY_SECONDS:-8}"
PROJECT_DIR="${IBKR_PROJECT_DIR:-/opt/trading-algorithm}"
AUTOLOGIN_SCRIPT="${IBKR_AUTOLOGIN_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-autologin-vps.sh}"
RECOVERY_SCRIPT="${IBKR_RECOVERY_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-recovery-vps.sh}"
LOGIN_ENV_JSON="${IBKR_LOGIN_ENV_JSON:-/opt/ibkr-runtime/run/ibkr-login.json}"
CAPTURE_SCRIPT="${IBKR_CAPTURE_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-capture-auth-state-vps.sh}"
PM2_ECOSYSTEM_CONFIG="${IBKR_PM2_ECOSYSTEM_CONFIG:-${PROJECT_DIR}/scripts/ibkr-vps-ecosystem.config.cjs}"

if [ ! -f "${LOGIN_ENV_JSON}" ]; then
  echo "Missing IBKR login JSON: ${LOGIN_ENV_JSON}" >&2
  exit 1
fi

cd "${PROJECT_DIR}"

capture_state() {
  local phase="$1"
  if [ -x "${CAPTURE_SCRIPT}" ]; then
    "${CAPTURE_SCRIPT}" "${SOURCE}" "${phase}" || true
  fi
}

wait_for_pm2_pid() {
  local pid=""
  for _ in $(seq 1 15); do
    pid="$(pm2 pid ibgateway 2>/dev/null | tail -n 1 | tr -d '[:space:]' || true)"
    if [[ "${pid}" =~ ^[1-9][0-9]*$ ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

restart_ibgateway() {
  if pm2 describe ibgateway >/dev/null 2>&1; then
    pm2 restart ibgateway --update-env >/dev/null 2>&1 && return 0
  fi

  if [ -f "${PM2_ECOSYSTEM_CONFIG}" ]; then
    pm2 start "${PM2_ECOSYSTEM_CONFIG}" --only ibgateway --update-env >/dev/null 2>&1 && return 0
  fi

  return 1
}

if ! restart_ibgateway; then
  capture_state "pm2-restart-failed"
  echo "Could not restart or start pm2 app ibgateway" >&2
  exit 1
fi

if ! wait_for_pm2_pid; then
  capture_state "pm2-pid-missing"
  echo "pm2 app ibgateway did not report a live pid after restart" >&2
  exit 1
fi

sleep "${START_DELAY_SECONDS}"

if ! "${AUTOLOGIN_SCRIPT}" "${SOURCE}"; then
  capture_state "autologin-failed"
  exit 1
fi

if [ -x "${RECOVERY_SCRIPT}" ]; then
  nohup "${RECOVERY_SCRIPT}" "${SOURCE}" >/opt/ibkr-runtime/logs/ibkr-recovery.log 2>&1 &
fi

echo "Triggered IBKR auto-login for ${SOURCE}"
