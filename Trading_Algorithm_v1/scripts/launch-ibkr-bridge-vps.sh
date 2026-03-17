#!/usr/bin/env bash
set -euo pipefail

cd /opt/trading-algorithm

exec node dist/tools/runIbkrBridge.js
