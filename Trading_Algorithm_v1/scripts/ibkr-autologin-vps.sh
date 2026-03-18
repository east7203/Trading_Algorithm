#!/usr/bin/env bash
set -euo pipefail

SOURCE="${1:-manual}"
DISPLAY_ID="${IBKR_DISPLAY:-:99}"
WINDOW_NAME="${IBKR_WINDOW_NAME:-IBKR Gateway}"
WINDOW_WAIT_SECONDS="${IBKR_WINDOW_WAIT_SECONDS:-60}"
TYPE_DELAY_MS="${IBKR_TYPE_DELAY_MS:-25}"
WINDOW_WIDTH="${IBKR_WINDOW_WIDTH:-790}"
WINDOW_HEIGHT="${IBKR_WINDOW_HEIGHT:-610}"
USERNAME_X="${IBKR_USERNAME_FIELD_X:-300}"
USERNAME_Y="${IBKR_USERNAME_FIELD_Y:-277}"
LOGIN_ENV_JSON="${IBKR_LOGIN_ENV_JSON:-/opt/ibkr-runtime/run/ibkr-login.json}"

if [ ! -f "${LOGIN_ENV_JSON}" ]; then
  echo "Missing IBKR login JSON: ${LOGIN_ENV_JSON}" >&2
  exit 1
fi

readarray -t LOGIN_VALUES < <(
  python3 - "${LOGIN_ENV_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], 'r', encoding='utf-8') as fh:
    payload = json.load(fh)

print(payload.get('username', ''))
print(payload.get('password', ''))
PY
)

IBKR_USERNAME="${LOGIN_VALUES[0]:-}"
IBKR_PASSWORD="${LOGIN_VALUES[1]:-}"

if [ -z "${IBKR_USERNAME}" ] || [ -z "${IBKR_PASSWORD}" ]; then
  echo "IBKR login JSON is missing username or password" >&2
  exit 1
fi

export DISPLAY="${DISPLAY_ID}"

type_text() {
  python3 - "$1" <<'PY' | while IFS= read -r action; do
import sys

special_map = {
    ' ': 'space',
    '!': 'exclam',
    '"': 'quotedbl',
    '#': 'numbersign',
    '$': 'dollar',
    '%': 'percent',
    '&': 'ampersand',
    "'": 'apostrophe',
    '(': 'parenleft',
    ')': 'parenright',
    '*': 'asterisk',
    '+': 'plus',
    ',': 'comma',
    '-': 'minus',
    '.': 'period',
    '/': 'slash',
    ':': 'colon',
    ';': 'semicolon',
    '<': 'less',
    '=': 'equal',
    '>': 'greater',
    '?': 'question',
    '@': 'at',
    '[': 'bracketleft',
    '\\': 'backslash',
    ']': 'bracketright',
    '^': 'asciicircum',
    '_': 'underscore',
    '`': 'grave',
    '{': 'braceleft',
    '|': 'bar',
    '}': 'braceright',
    '~': 'asciitilde'
}

for char in sys.argv[1]:
    if char.isalnum():
        print(f'TYPE::{char}')
    else:
        print(f'KEY::{special_map.get(char, f"U{ord(char):04X}")}')
PY
    case "${action}" in
      TYPE::*)
        xdotool type --delay "${TYPE_DELAY_MS}" -- "${action#TYPE::}"
        ;;
      KEY::*)
        xdotool key --clearmodifiers "${action#KEY::}"
        ;;
    esac
    sleep 0.03
  done
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
  echo "Could not find ${WINDOW_NAME} window on ${DISPLAY_ID}" >&2
  exit 1
fi

xdotool windowactivate --sync "${WINDOW_ID}"
sleep 1
xdotool windowsize "${WINDOW_ID}" "${WINDOW_WIDTH}" "${WINDOW_HEIGHT}" || true

# The refreshed IB Gateway login form is more reliable when navigated
# keyboard-first after focusing the username field.
xdotool mousemove --window "${WINDOW_ID}" "${USERNAME_X}" "${USERNAME_Y}" click 1
sleep 0.2
xdotool key --clearmodifiers ctrl+a BackSpace
sleep 0.2
type_text "${IBKR_USERNAME}"
sleep 0.2
xdotool key --clearmodifiers Tab
sleep 0.2
type_text "${IBKR_PASSWORD}"
sleep 0.4
xdotool key --clearmodifiers Return || true

echo "Submitted IBKR Gateway credentials for ${SOURCE} using window ${WINDOW_ID}"
