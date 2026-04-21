#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
DISPLAY_ID="${IBKR_DISPLAY:-:99}"
WINDOW_NAME="${IBKR_WINDOW_NAME:-IBKR Gateway}"
AUTH_DIALOG_NAME="${IBKR_AUTH_DIALOG_NAME:-Second Factor Authentication}"
AUTH_DIALOG_PATTERNS="${IBKR_AUTH_DIALOG_PATTERNS:-${AUTH_DIALOG_NAME}|Secure Login System|IB Key|Login Notification|Challenge/Response|Confirm Login}"
WINDOW_WAIT_SECONDS="${IBKR_WINDOW_WAIT_SECONDS:-30}"
WINDOW_WIDTH="${IBKR_WINDOW_WIDTH:-790}"
WINDOW_HEIGHT="${IBKR_WINDOW_HEIGHT:-610}"
STEP_DELAY_SECONDS="${IBKR_AUTH_LINK_STEP_DELAY_SECONDS:-2}"
RESEND_LINK_X="${IBKR_RESEND_LINK_X:-214}"
RESEND_LINK_Y="${IBKR_RESEND_LINK_Y:-478}"
CHALLENGE_LINK_X="${IBKR_CHALLENGE_LINK_X:-252}"
CHALLENGE_LINK_Y="${IBKR_CHALLENGE_LINK_Y:-492}"
QR_LINK_X="${IBKR_QR_LINK_X:-212}"
QR_LINK_Y="${IBKR_QR_LINK_Y:-514}"
CAPTURE_SCRIPT="${IBKR_CAPTURE_SCRIPT:-/opt/trading-algorithm/scripts/ibkr-capture-auth-state-vps.sh}"

export DISPLAY="${DISPLAY_ID}"

capture_state() {
  local phase="$1"
  if [ -x "${CAPTURE_SCRIPT}" ]; then
    "${CAPTURE_SCRIPT}" "${SOURCE}" "${phase}" || true
  fi
}

WINDOW_ID=""
for _ in $(seq 1 "${WINDOW_WAIT_SECONDS}"); do
  WINDOW_ID="$(xdotool search --onlyvisible --name "${WINDOW_NAME}" 2>/dev/null | head -n 1 || true)"
  if [ -n "${WINDOW_ID}" ]; then
    break
  fi
  sleep 1
done

if [ -z "${WINDOW_ID}" ]; then
  capture_state "resend-missing-window"
  echo "Could not find ${WINDOW_NAME} window on ${DISPLAY_ID}" >&2
  exit 1
fi

find_auth_dialog() {
  local pattern=""
  local dialog_id=""
  IFS='|' read -r -a patterns <<<"${AUTH_DIALOG_PATTERNS}"
  for pattern in "${patterns[@]}"; do
    pattern="$(printf '%s' "${pattern}" | xargs)"
    if [ -z "${pattern}" ]; then
      continue
    fi
    dialog_id="$(xdotool search --onlyvisible --name "${pattern}" 2>/dev/null | head -n 1 || true)"
    if [ -n "${dialog_id}" ]; then
      printf '%s\n' "${dialog_id}"
      return 0
    fi
  done
  return 1
}

click_auth_link() {
  local label="$1"
  local link_x="$2"
  local link_y="$3"
  local dialog_id

  dialog_id="$(find_auth_dialog)"
  if [ -z "${dialog_id}" ]; then
    return 1
  fi

  xdotool windowactivate --sync "${dialog_id}" || true
  sleep 0.2
  xdotool windowsize "${dialog_id}" 506 636 >/dev/null 2>&1 || true
  xdotool mousemove --window "${dialog_id}" "${link_x}" "${link_y}" click 1 || true
  sleep "${STEP_DELAY_SECONDS}"
  echo "Activated ${label} on dialog ${dialog_id}"
  return 0
}

xdotool windowactivate --sync "${WINDOW_ID}" || true
sleep 0.5
xdotool windowsize "${WINDOW_ID}" "${WINDOW_WIDTH}" "${WINDOW_HEIGHT}" || true

ATTEMPTED=0

if click_auth_link "Resend Notification" "${RESEND_LINK_X}" "${RESEND_LINK_Y}"; then
  ATTEMPTED=1
fi

if click_auth_link "Challenge/Response" "${CHALLENGE_LINK_X}" "${CHALLENGE_LINK_Y}"; then
  ATTEMPTED=1
fi

if click_auth_link "QR code" "${QR_LINK_X}" "${QR_LINK_Y}"; then
  ATTEMPTED=1
fi

if [ "${ATTEMPTED}" -eq 0 ]; then
  capture_state "resend-missing-auth-dialog"
  echo "Could not find an IBKR auth dialog (${AUTH_DIALOG_PATTERNS}) on ${DISPLAY_ID}" >&2
  exit 1
fi

capture_state "resend-finished"

echo "Triggered IBKR broker fallback controls for ${SOURCE} using window ${WINDOW_ID}"
