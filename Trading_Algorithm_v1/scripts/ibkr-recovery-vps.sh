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
LOGIN_BUTTON_X="${IBKR_LOGIN_BUTTON_X:-395}"
LOGIN_BUTTON_Y="${IBKR_LOGIN_BUTTON_Y:-360}"

export DISPLAY="${DISPLAY_ID}"

WINDOW_ID=""
for _ in $(seq 1 "${WINDOW_WAIT_SECONDS}"); do
  WINDOW_ID="$(xdotool search --name "${WINDOW_NAME}" 2>/dev/null | head -n 1 || true)"
  if [ -n "${WINDOW_ID}" ]; then
    break
  fi
  sleep 1
done

if [ -z "${WINDOW_ID}" ]; then
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

  # If Gateway is back on the login form and the stored credentials are still present,
  # a keyboard-driven submit is more reliable than stale button coordinates.
  xdotool key --window "${WINDOW_ID}" --clearmodifiers Tab Tab space || true
  sleep 0.3
  xdotool key --window "${WINDOW_ID}" --clearmodifiers Return || true

  sleep "${POLL_SECONDS}"
done
