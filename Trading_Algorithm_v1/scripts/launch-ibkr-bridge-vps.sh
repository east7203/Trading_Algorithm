#!/usr/bin/env bash
set -euo pipefail

cd /opt/trading-algorithm

export IBKR_POLL_GAP_SECONDS="${IBKR_POLL_GAP_SECONDS:-60}"
export IBKR_POLL_BACKFILL_DURATION="${IBKR_POLL_BACKFILL_DURATION:-1800 S}"
export IBKR_MARKET_DATA_TYPE="${IBKR_MARKET_DATA_TYPE:-1}"

exec node dist/tools/runIbkrBridge.js
