#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
PHASE="${2:-capture}"
DISPLAY_ID="${IBKR_DISPLAY:-:99}"
WINDOW_NAME="${IBKR_WINDOW_NAME:-IBKR Gateway}"
AUTH_DIALOG_PATTERNS="${IBKR_AUTH_DIALOG_PATTERNS:-Second Factor Authentication|Secure Login System|IB Key|Login Notification|Challenge/Response|Confirm Login}"
CAPTURE_DIR="${IBKR_CAPTURE_DIR:-/opt/ibkr-runtime/logs/ibkr-auth}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"

safe_token() {
  printf '%s' "$1" | tr -cs 'A-Za-z0-9._-' '_'
}

search_window() {
  local pattern="$1"
  xdotool search --onlyvisible --name "${pattern}" 2>/dev/null | head -n 1 || true
}

find_auth_dialog() {
  local pattern=""
  local dialog_id=""
  IFS='|' read -r -a patterns <<<"${AUTH_DIALOG_PATTERNS}"
  for pattern in "${patterns[@]}"; do
    pattern="$(printf '%s' "${pattern}" | xargs)"
    if [ -z "${pattern}" ]; then
      continue
    fi
    dialog_id="$(search_window "${pattern}")"
    if [ -n "${dialog_id}" ]; then
      printf '%s\n' "${dialog_id}"
      return 0
    fi
  done
  return 1
}

SOURCE_SAFE="$(safe_token "${SOURCE}")"
PHASE_SAFE="$(safe_token "${PHASE}")"
BASE_PATH="${CAPTURE_DIR}/${TIMESTAMP}-${SOURCE_SAFE}-${PHASE_SAFE}"
MANIFEST_PATH="${BASE_PATH}.txt"

mkdir -p "${CAPTURE_DIR}"

GATEWAY_WINDOW_ID="$(search_window "${WINDOW_NAME}")"
AUTH_DIALOG_ID="$(find_auth_dialog || true)"
TARGET_WINDOW_ID="${AUTH_DIALOG_ID:-${GATEWAY_WINDOW_ID}}"

{
  echo "capturedAt=$(date -u +%FT%TZ)"
  echo "display=${DISPLAY_ID}"
  echo "source=${SOURCE}"
  echo "phase=${PHASE}"
  echo "gatewayWindowName=${WINDOW_NAME}"
  echo "gatewayWindowId=${GATEWAY_WINDOW_ID}"
  echo "authDialogPatterns=${AUTH_DIALOG_PATTERNS}"
  echo "authDialogId=${AUTH_DIALOG_ID}"
  echo "targetWindowId=${TARGET_WINDOW_ID}"
  if [ -n "${TARGET_WINDOW_ID}" ]; then
    echo "targetWindowName=$(xdotool getwindowname "${TARGET_WINDOW_ID}" 2>/dev/null || true)"
    xwininfo -display "${DISPLAY_ID}" -id "${TARGET_WINDOW_ID}" 2>/dev/null || true
  fi
} >"${MANIFEST_PATH}"

echo "ARTIFACT:${MANIFEST_PATH}"

if [ -n "${TARGET_WINDOW_ID}" ] && command -v xwd >/dev/null 2>&1; then
  XWD_PATH="${BASE_PATH}.xwd"
  if xwd -silent -display "${DISPLAY_ID}" -id "${TARGET_WINDOW_ID}" -out "${XWD_PATH}" >/dev/null 2>&1; then
    if command -v convert >/dev/null 2>&1; then
      PNG_PATH="${BASE_PATH}.png"
      if convert "${XWD_PATH}" "${PNG_PATH}" >/dev/null 2>&1; then
        rm -f "${XWD_PATH}"
        echo "ARTIFACT:${PNG_PATH}"
        echo "Captured IBKR auth state at ${PNG_PATH}"
        exit 0
      fi
    fi

    echo "ARTIFACT:${XWD_PATH}"
    echo "Captured IBKR auth state at ${XWD_PATH}"
    exit 0
  fi
fi

echo "Captured IBKR auth state metadata at ${MANIFEST_PATH}"
