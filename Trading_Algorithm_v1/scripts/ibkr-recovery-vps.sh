#!/usr/bin/env bash
set -euo pipefail

DISPLAY_ID="${IBKR_DISPLAY:-:99}"
WINDOW_NAME="${IBKR_WINDOW_NAME:-IBKR Gateway}"
WINDOW_WAIT_SECONDS="${IBKR_WINDOW_WAIT_SECONDS:-60}"
START_DELAY_SECONDS="${IBKR_RECOVERY_START_DELAY_SECONDS:-18}"
ATTEMPTS="${IBKR_RECOVERY_ATTEMPTS:-3}"
POLL_SECONDS="${IBKR_RECOVERY_POLL_SECONDS:-8}"
RELOGIN_BUTTON_X="${IBKR_RELOGIN_BUTTON_X:-278}"
RELOGIN_BUTTON_Y="${IBKR_RELOGIN_BUTTON_Y:-262}"
PROJECT_DIR="${IBKR_PROJECT_DIR:-/opt/trading-algorithm}"
AUTOLOGIN_SCRIPT="${IBKR_AUTOLOGIN_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-autologin-vps.sh}"
RESEND_PUSH_SCRIPT="${IBKR_RESEND_PUSH_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-resend-push-vps.sh}"
CAPTURE_SCRIPT="${IBKR_CAPTURE_SCRIPT:-${PROJECT_DIR}/scripts/ibkr-capture-auth-state-vps.sh}"

export DISPLAY="${DISPLAY_ID}"

capture_state() {
  local phase="$1"
  if [ -x "${CAPTURE_SCRIPT}" ]; then
    "${CAPTURE_SCRIPT}" "${SOURCE}" "${phase}" || true
  fi
}

WINDOW_ID=""
for _ in $(seq 1 "${WINDOW_WAIT_SECONDS}"); do
  WINDOW_ID="$(xdotool search --name "${WINDOW_NAME}" 2>/dev/null | head -n 1 || true)"
  if [ -n "${WINDOW_ID}" ]; then
    break
  fi
  sleep 1
done

if [ -z "${WINDOW_ID}" ]; then
  capture_state "recovery-missing-window"
  echo "Could not find ${WINDOW_NAME} window on ${DISPLAY_ID}" >&2
  exit 1
fi

sleep "${START_DELAY_SECONDS}"

for _ in $(seq 1 "${ATTEMPTS}"); do
  xdotool windowactivate --sync "${WINDOW_ID}" || true

  # Advance the "Re-login is required" modal if it appears.
  xdotool mousemove --window "${WINDOW_ID}" "${RELOGIN_BUTTON_X}" "${RELOGIN_BUTTON_Y}" click 1 || true
  sleep 0.3
  xdotool key --window "${WINDOW_ID}" --clearmodifiers Return || true
  sleep 0.5

  if [ -x "${AUTOLOGIN_SCRIPT}" ]; then
    "${AUTOLOGIN_SCRIPT}" "recovery-attempt-${_}" || true
  else
    xdotool key --window "${WINDOW_ID}" --clearmodifiers Return || true
  fi

  if [ -x "${RESEND_PUSH_SCRIPT}" ]; then
    "${RESEND_PUSH_SCRIPT}" "recovery-attempt-${_}" || true
  fi

  sleep "${POLL_SECONDS}"
done

capture_state "recovery-finished"
