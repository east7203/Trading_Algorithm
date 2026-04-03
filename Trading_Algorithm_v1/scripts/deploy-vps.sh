#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${PROJECT_ROOT}/.." && pwd)"
REMOTE_HOST="${DEPLOY_HOST:-root@167.172.252.171}"
REMOTE_PATH="${DEPLOY_PATH:-/opt/trading-algorithm}"
SSH_KEY="${DEPLOY_KEY:-$HOME/.ssh/trading_vps}"
SSH_PORT="${DEPLOY_PORT:-22}"
PM2_APPS="${DEPLOY_PM2_APPS:-trading-api ibkr-bridge yahoo-bridge ibkr-fallback-watchdog}"

if git -C "${REPO_ROOT}" rev-parse --verify HEAD^ >/dev/null 2>&1; then
  CHANGED_FILES="$(git -C "${REPO_ROOT}" diff --name-only HEAD^ HEAD)"
else
  CHANGED_FILES="$(git -C "${REPO_ROOT}" ls-files)"
fi

UI_ONLY_DEPLOY=false
if [[ -n "${CHANGED_FILES}" ]] \
  && printf '%s\n' "${CHANGED_FILES}" | grep -Eq '^Trading_Algorithm_v1/(mobile/|public/mobile/)' \
  && ! printf '%s\n' "${CHANGED_FILES}" | grep -Eq '^Trading_Algorithm_v1/(src/|scripts/|package(-lock)?\\.json$|tsconfig\\.json$|requirements-ibkr\\.txt$)'; then
  UI_ONLY_DEPLOY=true
fi

echo "Deploying ${PROJECT_ROOT} -> ${REMOTE_HOST}:${REMOTE_PATH}"
if [[ "${UI_ONLY_DEPLOY}" == "true" ]]; then
  echo "Detected UI-only deploy. Skipping PM2 restarts so the live IBKR session is left alone."
fi

rsync -az --delete \
  -e "ssh -i ${SSH_KEY} -p ${SSH_PORT}" \
  --exclude node_modules \
  --exclude dist \
  --exclude dist-desktop \
  --exclude ios \
  --exclude data \
  --exclude releases \
  --exclude '.env*' \
  --exclude '.pm2.env' \
  --exclude '.ibkr-login.json' \
  --exclude '.venv-ibkr' \
  --exclude '*.zip' \
  --exclude '.DS_Store' \
  "${PROJECT_ROOT}/" "${REMOTE_HOST}:${REMOTE_PATH}/"

ssh -i "${SSH_KEY}" -p "${SSH_PORT}" "${REMOTE_HOST}" "
  set -euo pipefail
  cd '${REMOTE_PATH}'
  npm ci
  npm run build
  chmod +x \
    scripts/launch-ibgateway-vps.sh \
    scripts/launch-ibkr-bridge-vps.sh \
    scripts/ibkr-autologin-vps.sh \
    scripts/ibkr-recovery-vps.sh \
    scripts/ibkr-resend-push-vps.sh \
    scripts/refresh-ibkr-history-vps.sh \
    scripts/trigger-ibkr-login-vps.sh
  if [ ! -x .venv-ibkr/bin/python ]; then
    python3 -m venv .venv-ibkr
  fi
  .venv-ibkr/bin/pip install --quiet --upgrade pip
  .venv-ibkr/bin/pip install --quiet -r requirements-ibkr.txt
  if [ -f .pm2.env ]; then
    python3 - <<'PY'
from pathlib import Path

env_path = Path('.pm2.env')
content = env_path.read_text()
legacy = 'IBKR_LOGIN_ENV_JSON=/opt/trading-algorithm/.ibkr-login.json'
current = 'IBKR_LOGIN_ENV_JSON=/opt/ibkr-runtime/run/ibkr-login.json'
heap_key = 'NODE_OPTIONS='
heap_value = 'NODE_OPTIONS=--max-old-space-size=1536'
promote_key = 'CONTINUOUS_TRAINING_ALWAYS_PROMOTE_LATEST='
promote_value = 'CONTINUOUS_TRAINING_ALWAYS_PROMOTE_LATEST=false'
if legacy in content:
    content = content.replace(legacy, current)
if heap_key not in content:
    content = content.rstrip('\n') + '\n' + heap_value + '\n'
if promote_key in content:
    content = '\n'.join(
        promote_value if line.startswith(promote_key) else line
        for line in content.splitlines()
    )
    if not content.endswith('\n'):
        content += '\n'
else:
    content = content.rstrip('\n') + '\n' + promote_value + '\n'
env_path.write_text(content)
PY
    eval \"\$(
      python3 - <<'PY'
from pathlib import Path
import shlex

for raw_line in Path('.pm2.env').read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    print(f'export {key.strip()}={shlex.quote(value)}')
PY
    )\"
  fi
  if [ '${UI_ONLY_DEPLOY}' != 'true' ]; then
    for app in ${PM2_APPS}; do
      if pm2 describe \"\${app}\" >/dev/null 2>&1; then
        if [ \"\${app}\" = \"trading-api\" ]; then
          pm2 restart \"\${app}\" --update-env --node-args='--max-old-space-size=1536'
        else
          pm2 restart \"\${app}\" --update-env
        fi
      fi
    done
  fi
  python3 - <<'PY'
import json
import subprocess
import time
import urllib.request

for _ in range(20):
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/diagnostics', timeout=5) as response:
            payload = json.load(response)
        diagnostics = payload.get('diagnostics', {})
        recovery = diagnostics.get('ibkrRecovery') or payload.get('ibkrRecovery', {})
        if recovery.get('lastConnectedAt') and not recovery.get('pendingReconnect'):
            subprocess.run(['pm2', 'stop', 'yahoo-bridge'], check=False)
            break
    except Exception:
        pass
    time.sleep(3)
PY
  if [ '${UI_ONLY_DEPLOY}' != 'true' ]; then
    pm2 save
  fi
"

echo "Deploy complete. Runtime state under ${REMOTE_PATH}/data was preserved."
