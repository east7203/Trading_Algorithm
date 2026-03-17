#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
START_DELAY_SECONDS="${IBKR_AUTOLOGIN_START_DELAY_SECONDS:-8}"
PROJECT_DIR="${IBKR_PROJECT_DIR:-/opt/trading-algorithm}"
AUTOLOGIN_SCRIPT="${IBKR_AUTOLOGIN_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-autologin-vps.sh}"
RECOVERY_SCRIPT="${IBKR_RECOVERY_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-recovery-vps.sh}"
LOGIN_ENV_JSON="${IBKR_LOGIN_ENV_JSON:-/opt/ibkr-runtime/run/ibkr-login.json}"

if [ ! -f "${LOGIN_ENV_JSON}" ]; then
  echo "Missing IBKR login JSON: ${LOGIN_ENV_JSON}" >&2
  exit 1
fi

cd "${PROJECT_DIR}"

pm2 restart ibgateway --update-env >/dev/null
sleep "${START_DELAY_SECONDS}"

"${AUTOLOGIN_SCRIPT}" "${SOURCE}"

if [ -x "${RECOVERY_SCRIPT}" ]; then
  nohup "${RECOVERY_SCRIPT}" "${SOURCE}" >/opt/ibkr-runtime/logs/ibkr-recovery.log 2>&1 &
fi

echo "Triggered IBKR auto-login for ${SOURCE}"
