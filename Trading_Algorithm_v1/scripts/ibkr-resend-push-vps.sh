#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
DISPLAY_ID="${IBKR_DISPLAY:-:99}"
WINDOW_NAME="${IBKR_WINDOW_NAME:-IBKR Gateway}"
AUTH_DIALOG_NAME="${IBKR_AUTH_DIALOG_NAME:-Second Factor Authentication}"
AUTH_DIALOG_PATTERNS="${IBKR_AUTH_DIALOG_PATTERNS:-${AUTH_DIALOG_NAME}|Secure Login System|IB Key|Login Notification|Challenge/Response|Confirm Login}"
WINDOW_WAIT_SECONDS="${IBKR_WINDOW_WAIT_SECONDS:-30}"
AUTH_DIALOG_WAIT_SECONDS="${IBKR_AUTH_DIALOG_WAIT_SECONDS:-45}"
WINDOW_WIDTH="${IBKR_WINDOW_WIDTH:-790}"
WINDOW_HEIGHT="${IBKR_WINDOW_HEIGHT:-610}"
STEP_DELAY_SECONDS="${IBKR_AUTH_LINK_STEP_DELAY_SECONDS:-2}"
ENABLE_BACKUP_CONTROLS="${IBKR_ENABLE_AUTH_BACKUP_CONTROLS:-false}"
RESEND_LINK_X="${IBKR_RESEND_LINK_X:-214}"
RESEND_LINK_Y="${IBKR_RESEND_LINK_Y:-478}"
RESEND_GATEWAY_X="${IBKR_RESEND_GATEWAY_X:-356}"
RESEND_GATEWAY_Y="${IBKR_RESEND_GATEWAY_Y:-568}"
RESEND_ROOT_X="${IBKR_RESEND_ROOT_X:-682}"
RESEND_ROOT_Y="${IBKR_RESEND_ROOT_Y:-714}"
AUTH_ROOT_FALLBACK_ENABLED="${IBKR_AUTH_ROOT_FALLBACK_ENABLED:-true}"
CHALLENGE_LINK_X="${IBKR_CHALLENGE_LINK_X:-252}"
CHALLENGE_LINK_Y="${IBKR_CHALLENGE_LINK_Y:-492}"
QR_LINK_X="${IBKR_QR_LINK_X:-212}"
QR_LINK_Y="${IBKR_QR_LINK_Y:-514}"
CAPTURE_SCRIPT="${IBKR_CAPTURE_SCRIPT:-/opt/trading-algorithm/scripts/ibkr-capture-auth-state-vps.sh}"
LOCK_DIR="${IBKR_GUI_LOCK_DIR:-/opt/ibkr-runtime/run}"
LOCK_FILE="${IBKR_GUI_LOCK_FILE:-${LOCK_DIR}/ibkr-gui-recovery.lock}"
LOCK_WAIT_SECONDS="${IBKR_GUI_LOCK_WAIT_SECONDS:-55}"

export DISPLAY="${DISPLAY_ID}"

acquire_gui_lock() {
  if [ "${IBKR_GUI_LOCK_HELD:-false}" = "true" ]; then
    return 0
  fi

  mkdir -p "${LOCK_DIR}"
  exec 200>"${LOCK_FILE}"
  if ! flock -w "${LOCK_WAIT_SECONDS}" 200; then
    echo "IBKR Gateway recovery is already running; skipped ${SOURCE}" >&2
    exit 75
  fi
  export IBKR_GUI_LOCK_HELD=true
}

capture_state() {
  local phase="$1"
  if [ -x "${CAPTURE_SCRIPT}" ]; then
    "${CAPTURE_SCRIPT}" "${SOURCE}" "${phase}" || true
  fi
}

search_window() {
  local pattern="$1"
  local window_id=""
  window_id="$(xdotool search --onlyvisible --name "${pattern}" 2>/dev/null | head -n 1 || true)"
  if [ -n "${window_id}" ]; then
    printf '%s\n' "${window_id}"
    return 0
  fi

  xdotool search --name "${pattern}" 2>/dev/null | head -n 1 || true
}

visible_window_ids() {
  xdotool search --onlyvisible --name ".*" 2>/dev/null || true
}

acquire_gui_lock

WINDOW_ID=""
for _ in $(seq 1 "${WINDOW_WAIT_SECONDS}"); do
  WINDOW_ID="$(search_window "${WINDOW_NAME}")"
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
  local window_name=""
  IFS='|' read -r -a patterns <<<"${AUTH_DIALOG_PATTERNS}"
  for pattern in "${patterns[@]}"; do
    pattern="$(printf '%s' "${pattern}" | xargs)"
    if [ -z "${pattern}" ]; then
      continue
    fi
    while IFS= read -r dialog_id; do
      if [ -z "${dialog_id}" ]; then
        continue
      fi
      window_name="$(xdotool getwindowname "${dialog_id}" 2>/dev/null || true)"
      if [[ "${window_name}" == *"${pattern}"* ]]; then
        printf '%s\n' "${dialog_id}"
        return 0
      fi
    done < <(visible_window_ids)

    dialog_id="$(search_window "${pattern}")"
    if [ -n "${dialog_id}" ]; then
      printf '%s\n' "${dialog_id}"
      return 0
    fi
  done
  return 1
}

wait_for_auth_dialog() {
  local dialog_id=""

  for _ in $(seq 1 "${AUTH_DIALOG_WAIT_SECONDS}"); do
    dialog_id="$(find_auth_dialog || true)"
    if [ -n "${dialog_id}" ]; then
      printf '%s\n' "${dialog_id}"
      return 0
    fi
    sleep 1
  done
  return 1
}

click_auth_link() {
  local dialog_id="$1"
  local label="$2"
  local link_x="$3"
  local link_y="$4"

  xdotool windowactivate --sync "${dialog_id}" || true
  sleep 0.2
  xdotool windowsize "${dialog_id}" 506 636 >/dev/null 2>&1 || true
  xdotool mousemove --window "${dialog_id}" "${link_x}" "${link_y}" click 1 || true
  sleep "${STEP_DELAY_SECONDS}"
  echo "Activated ${label} on dialog ${dialog_id}"
  return 0
}

click_gateway_resend_fallback() {
  local click_x="${RESEND_ROOT_X}"
  local click_y="${RESEND_ROOT_Y}"

  if [ -n "${WINDOW_ID}" ]; then
    xdotool windowactivate --sync "${WINDOW_ID}" || true
    sleep 0.2
    xdotool windowsize "${WINDOW_ID}" "${WINDOW_WIDTH}" "${WINDOW_HEIGHT}" >/dev/null 2>&1 || true
    if eval "$(
      xdotool getwindowgeometry --shell "${WINDOW_ID}" 2>/dev/null \
        | sed -e 's/^X=/WINDOW_LEFT=/' -e 's/^Y=/WINDOW_TOP=/' -e 's/^WIDTH=/WINDOW_WIDTH_ACTUAL=/' -e 's/^HEIGHT=/WINDOW_HEIGHT_ACTUAL=/'
    )"; then
      if [[ "${WINDOW_LEFT:-}" =~ ^-?[0-9]+$ ]] && [[ "${WINDOW_TOP:-}" =~ ^-?[0-9]+$ ]]; then
        click_x=$((WINDOW_LEFT + RESEND_GATEWAY_X))
        click_y=$((WINDOW_TOP + RESEND_GATEWAY_Y))
      fi
    fi
  fi

  xdotool mousemove "${click_x}" "${click_y}" click 1 || return 1
  sleep "${STEP_DELAY_SECONDS}"
  echo "Activated Resend Notification from Gateway auth screen at ${click_x},${click_y}"
  return 0
}

xdotool windowactivate --sync "${WINDOW_ID}" || true
sleep 0.5
xdotool windowsize "${WINDOW_ID}" "${WINDOW_WIDTH}" "${WINDOW_HEIGHT}" || true

AUTH_DIALOG_ID="$(wait_for_auth_dialog || true)"
if [ -z "${AUTH_DIALOG_ID}" ]; then
  if [ "${AUTH_ROOT_FALLBACK_ENABLED}" = "true" ]; then
    if click_gateway_resend_fallback; then
      capture_state "resend-finished"
      echo "Triggered IBKR Mobile notification controls for ${SOURCE} using Gateway auth-screen fallback on window ${WINDOW_ID}"
      exit 0
    fi
  fi
  capture_state "resend-missing-auth-dialog"
  echo "Could not find an IBKR auth dialog (${AUTH_DIALOG_PATTERNS}) on ${DISPLAY_ID}" >&2
  exit 1
fi

ATTEMPTED=0

if click_auth_link "${AUTH_DIALOG_ID}" "Resend Notification" "${RESEND_LINK_X}" "${RESEND_LINK_Y}"; then
  ATTEMPTED=1
fi

if [ "${ENABLE_BACKUP_CONTROLS}" = "true" ]; then
  if click_auth_link "${AUTH_DIALOG_ID}" "Challenge/Response" "${CHALLENGE_LINK_X}" "${CHALLENGE_LINK_Y}"; then
    ATTEMPTED=1
  fi

  if click_auth_link "${AUTH_DIALOG_ID}" "QR code" "${QR_LINK_X}" "${QR_LINK_Y}"; then
    ATTEMPTED=1
  fi
fi

if [ "${ATTEMPTED}" -eq 0 ]; then
  capture_state "resend-missing-auth-dialog"
  echo "Could not find an IBKR auth dialog (${AUTH_DIALOG_PATTERNS}) on ${DISPLAY_ID}" >&2
  exit 1
fi

capture_state "resend-finished"

echo "Triggered IBKR Mobile notification controls for ${SOURCE} using window ${WINDOW_ID}"
