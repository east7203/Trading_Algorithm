#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${PROJECT_ROOT:-/opt/trading-algorithm}"
cd "${PROJECT_ROOT}"

mkdir -p data/logs data/historical/ibkr-auto

ENV_FILE="${PROJECT_ROOT}/.env.ibkr.bridge"
if [[ -f "${ENV_FILE}" ]]; then
  while IFS= read -r raw_line || [[ -n "${raw_line}" ]]; do
    line="${raw_line#"${raw_line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"
    [[ -z "${line}" || "${line}" == \#* || "${line}" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    export "${key}=${value}"
  done < "${ENV_FILE}"
fi

export IBKR_BRIDGE_ENV_FILE=".env.ibkr.bridge"

BASE_CLIENT_ID="${IBKR_CLIENT_ID:-17021}"
if [[ "${BASE_CLIENT_ID}" =~ ^[0-9]+$ ]]; then
  export IBKR_CLIENT_ID="$((BASE_CLIENT_ID + 100 + ($$ % 1000)))"
else
  export IBKR_CLIENT_ID="$((17121 + ($$ % 1000)))"
fi

START_UTC="$(date -u -d '3 days ago' +"%Y-%m-%dT%H:%M:%SZ")"
END_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
export START_UTC END_UTC
OUTPUT_DIR="data/historical/ibkr-auto"

find "${OUTPUT_DIR}" -type f -name '*.csv' -delete

npm run fetch:ibkr -- \
  --symbols NQ,ES \
  --start "${START_UTC}" \
  --end "${END_UTC}" \
  --timeframe 1m \
  --outputDir "${OUTPUT_DIR}" \
  --continuous true \
  --useRth false \
  --pacingSleepSeconds 1

pm2 restart trading-api --update-env >/dev/null
sleep 8
curl -fsS -X POST http://127.0.0.1:3000/training/retrain >/dev/null || true

python3 - <<'PY'
from pathlib import Path
import json
from datetime import datetime, timezone
import os

log_path = Path('/opt/trading-algorithm/data/logs/ibkr-history-refresh-state.json')
payload = {
    'lastRefreshedAt': datetime.now(timezone.utc).isoformat(),
    'windowStartUtc': os.environ.get('START_UTC'),
    'windowEndUtc': os.environ.get('END_UTC')
}
log_path.write_text(json.dumps(payload, indent=2))
PY

echo "[ibkr-history-refresh] completed window ${START_UTC} -> ${END_UTC}"
