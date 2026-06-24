#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
DISPLAY_ID="${IBKR_DISPLAY:-:99}"
WINDOW_NAME="${IBKR_WINDOW_NAME:-IBKR Gateway}"
RELOGIN_PATTERNS="${IBKR_RELOGIN_PATTERNS:-Re-login is required|Login is required}"
WINDOW_WAIT_SECONDS="${IBKR_RELOGIN_WINDOW_WAIT_SECONDS:-20}"
WINDOW_WIDTH="${IBKR_WINDOW_WIDTH:-790}"
WINDOW_HEIGHT="${IBKR_WINDOW_HEIGHT:-610}"
RELOGIN_BUTTON_X="${IBKR_RELOGIN_BUTTON_X:-278}"
RELOGIN_BUTTON_Y="${IBKR_RELOGIN_BUTTON_Y:-262}"
RELOGIN_DIALOG_BUTTON_X="${IBKR_RELOGIN_DIALOG_BUTTON_X:-250}"
RELOGIN_DIALOG_BUTTON_Y="${IBKR_RELOGIN_DIALOG_BUTTON_Y:-82}"
CAPTURE_SCRIPT="${IBKR_CAPTURE_SCRIPT:-/opt/trading-algorithm/scripts/ibkr-capture-auth-state-vps.sh}"

export DISPLAY="${DISPLAY_ID}"

capture_state() {
  local phase="$1"
  if [ -x "${CAPTURE_SCRIPT}" ]; then
    "${CAPTURE_SCRIPT}" "${SOURCE}" "${phase}" || true
  fi
}

search_visible_window() {
  local pattern="$1"
  xdotool search --onlyvisible --name "${pattern}" 2>/dev/null | head -n 1 || true
}

visible_window_ids() {
  xdotool search --onlyvisible --name ".*" 2>/dev/null || true
}

find_relogin_window() {
  local pattern=""
  local window_name=""
  local window_id=""
  IFS='|' read -r -a patterns <<<"${RELOGIN_PATTERNS}"
  for pattern in "${patterns[@]}"; do
    pattern="$(printf '%s' "${pattern}" | xargs)"
    if [ -z "${pattern}" ]; then
      continue
    fi
    while IFS= read -r window_id; do
      if [ -z "${window_id}" ]; then
        continue
      fi
      window_name="$(xdotool getwindowname "${window_id}" 2>/dev/null || true)"
      if [[ "${window_name}" == *"${pattern}"* ]]; then
        printf '%s\n' "${window_id}"
        return 0
      fi
    done < <(visible_window_ids)

    window_id="$(search_visible_window "${pattern}")"
    if [ -n "${window_id}" ]; then
      printf '%s\n' "${window_id}"
      return 0
    fi
  done
  return 1
}

GATEWAY_WINDOW_ID=""
RELOGIN_WINDOW_ID=""

for _ in $(seq 1 "${WINDOW_WAIT_SECONDS}"); do
  GATEWAY_WINDOW_ID="$(search_visible_window "${WINDOW_NAME}")"
  RELOGIN_WINDOW_ID="$(find_relogin_window || true)"
  if [ -n "${GATEWAY_WINDOW_ID}" ] || [ -n "${RELOGIN_WINDOW_ID}" ]; then
    break
  fi
  sleep 1
done

if [ -n "${RELOGIN_WINDOW_ID}" ]; then
  xdotool windowactivate --sync "${RELOGIN_WINDOW_ID}" || true
  sleep 0.3
  xdotool mousemove --window "${RELOGIN_WINDOW_ID}" "${RELOGIN_DIALOG_BUTTON_X}" "${RELOGIN_DIALOG_BUTTON_Y}" click 1 || true
  sleep 1
  capture_state "relogin-dialog-advanced"
  echo "Advanced IB Gateway re-login dialog ${RELOGIN_WINDOW_ID} for ${SOURCE}"
  exit 0
fi

if [ -z "${GATEWAY_WINDOW_ID}" ]; then
  capture_state "relogin-missing-window"
  echo "Could not find ${WINDOW_NAME} or a re-login dialog on ${DISPLAY_ID}" >&2
  exit 1
fi

xdotool windowactivate --sync "${GATEWAY_WINDOW_ID}" || true
sleep 0.3
xdotool windowsize "${GATEWAY_WINDOW_ID}" "${WINDOW_WIDTH}" "${WINDOW_HEIGHT}" || true
sleep 0.2

# Some IB Gateway builds render the re-login prompt inside the main Gateway
# window rather than as its own dialog. Press Return and click the known prompt
# area so the next login or second-factor screen can appear.
xdotool key --window "${GATEWAY_WINDOW_ID}" --clearmodifiers Return || true
sleep 0.2
xdotool mousemove --window "${GATEWAY_WINDOW_ID}" "${RELOGIN_BUTTON_X}" "${RELOGIN_BUTTON_Y}" click 1 || true
sleep 1

capture_state "relogin-window-advanced"
echo "Advanced IB Gateway re-login prompt from main window ${GATEWAY_WINDOW_ID} for ${SOURCE}"
