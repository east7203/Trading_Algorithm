#!/usr/bin/env bash
set -euo pipefail

cd /opt/trading-algorithm

if [ -z "${BRIDGE_ENV_FILE:-}" ]; then
  if [ -f .env.tradovate.bridge ]; then
    export BRIDGE_ENV_FILE=".env.tradovate.bridge"
  else
    export BRIDGE_ENV_FILE=".env.bridge"
  fi
fi

exec node dist/tools/runTradovateBridge.js
