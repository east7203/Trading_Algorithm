# Trading Algorithm v1 (E8 Futures, Manual-Only Assist)

Rule-first, AI-assisted daytrading service focused on funded-account survival.

## What is implemented

- Multi-setup portfolio detector pipeline with normalized `SetupCandidate` output.
- Rule-first ranking (`/signals/rank`) where AI/1m only influences score for already-eligible signals.
- Risk engine with hard brakes:
  - default per-trade risk `0.50%`
  - user max risk cap (never above `1.00%`)
  - hard cap `1.00%` enforced
  - morning-only trading window guard (default: `08:30-11:30 America/New_York`)
  - daily/session loss caps
  - max consecutive losses
  - spread/slippage guards
  - kill switch
  - strict high-impact USD news block (`T-15m` to `T+30m`)
- Manual-only execution workflow:
  - `POST /execution/propose` (build manual execution intent)
  - `POST /execution/approve` (manual approval + audit log, no broker API order placement)
  - approval now requires explicit checklist confirmation (`manualChecklistConfirmed=true`, `paperAccountConfirmed=true`)
- Symbol support for futures workflows: `NQ`, `ES`, `MNQ`, `MYM` (legacy aliases `NAS100`, `US30` are still accepted where applicable).
- Full audit trail for signal, risk, approval, and execution events.
- Policy confirmation guard required before approval.

## Compliance mode

This build is configured for manual execution only: it helps detect/rank setups and logs approvals, but it does not place broker API orders.

## Required endpoints

- `POST /signals/generate`
- `POST /signals/rank`
- `POST /risk/check`
- `PATCH /risk/config`
- `POST /execution/propose`
- `POST /execution/approve`
- `GET /execution/pending`
- `GET /journal/trades`
- `GET /health`

## Core types

Implemented in `src/domain/types.ts`:

- `SetupCandidate`
- `RiskConfig`
- `RiskDecision`
- `ExecutionIntent`
- `OrderEvent`

## Setup portfolio (v1)

Implemented detectors:

1. Liquidity sweep -> MSS -> FVG continuation
2. Liquidity sweep reversal from session highs/lows
3. Displacement + order-block retest continuation
4. NY break-and-retest momentum

## News source

`EconomicCalendarClient` interface is included and currently backed by an in-memory adapter with source label `paid-economic-calendar-api`, ready to replace with a paid calendar provider.

## Morning window config

Use `PATCH /risk/config` to tune morning trading times:

```json
{
  "tradingWindow": {
    "enabled": true,
    "timezone": "America/New_York",
    "startHour": 8,
    "startMinute": 30,
    "endHour": 11,
    "endMinute": 30
  }
}
```

## Test coverage in repo

- Unit: setup detectors (positive/negative fixtures)
- Unit: 1m confidence score-only behavior
- Unit: risk bounds and hard cap enforcement
- Integration: pending intent lifecycle with manual-only approvals (no automated order send)
- Integration: mobile app shell + health endpoint
- Integration/acceptance: unapproved-order blocking, risk-cap guard, news-window order blocking

## Historical model training

The app can learn ranking weights from historical 1-minute CSV data and apply them at runtime.

Historical source options:

- IBKR TWS API + IB Gateway (best budget path if you already have IBKR futures market-data subscriptions)
- Databento (CME/GLBX market data, paid, best quality for futures automation)
- Polygon (stocks/indices historical API, useful futures proxy data via QQQ/DIA or NDX/DJI indices)
- Yahoo Chart API (free, delayed, limited 1m history window)
- Stooq CSV (free, long daily history)

Supported CSV columns (case-insensitive):

- required: `timestamp,time,date,datetime` + `open` + `high` + `low` + `close`
- optional: `volume`
- optional: `symbol,ticker,instrument` (or pass `--symbol` override)
- Databento `ts_event` timestamps are accepted as well
- if symbol column is missing and `--symbol` is not passed, the trainer tries to infer symbol from filename tokens (`NQ`, `ES`, `YM`, `MNQ`, `MYM`, `NAS100`, `US30`, `USTEC`, `US100`, `DJ30`, `DJI`, `SPY`, `SPX`, `GSPC`, `US500`)

Download 1-minute OHLCV from Databento directly into `data/historical`:

```bash
DATABENTO_API_KEY=your_key \
npm run fetch:databento -- \
  --symbols NQ.FUT,ES.FUT \
  --start 2024-01-01T00:00:00Z \
  --end 2026-03-01T00:00:00Z
```

Free Yahoo download (no paid key) for recent 1m history:

```bash
npm run fetch:yahoo -- \
  --symbols NQ=F,ES=F \
  --interval 1m \
  --start 2026-02-01T00:00:00Z \
  --end 2026-03-01T00:00:00Z \
  --symbolMap '{"NQ=F":"NQ","ES=F":"ES"}'
```

Free long-range daily history from Stooq:

```bash
npm run fetch:stooq -- \
  --symbols ^NDX,^GSPC \
  --interval d \
  --symbolMap '{"^NDX":"NQ","^GSPC":"ES"}'
```

Polygon historical download (stocks/indices proxy):

```bash
cp .env.polygon.example .env.polygon
# set POLYGON_API_KEY in .env.polygon
npm run fetch:polygon -- \
  --tickers QQQ,SPY \
  --start 2020-01-01 \
  --end 2026-03-10 \
  --timespan day \
  --symbolMap '{"QQQ":"NQ","SPY":"ES"}'
```

For intraday historical pulls from Polygon:

```bash
npm run fetch:polygon -- \
  --tickers QQQ,SPY \
  --start 2026-02-01 \
  --end 2026-03-10 \
  --timespan minute \
  --multiplier 1 \
  --symbolMap '{"QQQ":"NQ","SPY":"ES"}'
```

IBKR historical pull (continuous futures by default, requires TWS or IB Gateway running and API access enabled):

```bash
cp .env.ibkr.bridge.example .env.ibkr.bridge
# set IBKR_HOST / IBKR_PORT / IBKR_CLIENT_ID to match your IB Gateway or TWS session
npm run fetch:ibkr -- \
  --symbols NQ,ES \
  --start 2026-02-01T00:00:00Z \
  --end 2026-03-12T00:00:00Z \
  --timeframe 1m \
  --continuous true
```

Then train on minute-level datasets (recommended):

```bash
npm run train:model -- --inputDir data/historical/polygon-1m --recursive --validationPct 20
```

Train from one file:

```bash
npm run train:model -- --input data/historical/NQ_1m.csv --symbol NQ
```

Train from a whole folder recursively (best for maximum history):

```bash
npm run train:model -- --inputDir data/historical --recursive --symbol NQ --validationPct 20
```

You can also repeat `--input` multiple times:

```bash
npm run train:model -- --input data/historical/NQ_2024.csv --input data/historical/NQ_2025.csv --symbol NQ
```

Output model (default):

- `data/models/latest-ranking-model.json`

Training output now includes:

- file count, parsed bars, deduped bars
- generated labeled example count
- full-history baseline vs trained top-pick win-rate
- walk-forward validation stats on the newest data slice (`--validationPct`)

Multi-timeframe learning note:

- Training uses 1-minute bars as the base tape.
- It also computes and learns context from `5m`, `15m`, `1H`, `4H`, `D1`, `W1` inside the trainer.
- This context is stored as `metadata.aiContextScore` and learned through `aiContextWeight`.

Run API with trained model:

```bash
RANKING_MODEL_PATH=data/models/latest-ranking-model.json npm run dev
```

## Overnight training (hands-off)

Run a full unattended overnight pipeline:

- pulls Polygon historical data for `1m`, `5m`, `15m`, `1H`, `D1`, `W1`
- trains ranking model from the minute dataset with multi-timeframe context

Setup:

```bash
cp .env.overnight.example .env.overnight
# optionally tune dates/rate limits in .env.overnight
```

Run once:

```bash
npm run train:overnight
```

Run in background with PM2:

```bash
pm2 start npm --name overnight-trainer -- run train:overnight
pm2 logs overnight-trainer --lines 100
```

## Continuous self-training (historical + real-time)

This mode keeps retraining automatically while the API runs:

- bootstraps from past CSV files (`data/historical` by default)
- ingests new 1-minute bars in real-time
- retrains periodically and auto-activates the newest ranking model

### Enable it

```bash
CONTINUOUS_TRAINING_ENABLED=true \
CONTINUOUS_TRAINING_BOOTSTRAP_DIR=data/historical \
CONTINUOUS_TRAINING_RETRAIN_MINUTES=30 \
CONTINUOUS_TRAINING_MIN_NEW_BARS=30 \
npm run dev
```

Useful environment variables:

- `CONTINUOUS_TRAINING_ENABLED=true|false`
- `CONTINUOUS_TRAINING_BOOTSTRAP_DIR=data/historical`
- `CONTINUOUS_TRAINING_BOOTSTRAP_RECURSIVE=true|false`
- `CONTINUOUS_TRAINING_ARCHIVE_PATH=data/live/one-minute-bars.ndjson`
- `CONTINUOUS_TRAINING_MODEL_OUTPUT=data/models/latest-live-model.json`
- `CONTINUOUS_TRAINING_RETRAIN_MINUTES=30`
- `CONTINUOUS_TRAINING_MIN_NEW_BARS=30`
- `CONTINUOUS_TRAINING_MIN_BARS=300`
- `CONTINUOUS_TRAINING_MIN_EXAMPLES=120`
- `CONTINUOUS_TRAINING_MAX_BARS=300000`
- `CONTINUOUS_TRAINING_VALIDATION_PCT=20`
- `CONTINUOUS_TRAINING_TIMEZONE=America/New_York`

### Real-time bar ingestion API

Push new 1-minute bars continuously from your market-data bridge:

`POST /training/ingest-bars`

```json
{
  "bars": [
    {
      "symbol": "NQ",
      "timestamp": "2026-03-09T13:30:00.000Z",
      "open": 18200.0,
      "high": 18205.0,
      "low": 18195.0,
      "close": 18202.0,
      "volume": 12
    }
  ]
}
```

### Monitor and control

- `GET /training/status` for ingestion/model/training state
- `POST /training/retrain` to force an immediate retrain

### IBKR TWS / IB Gateway live bridge

The project now includes a dedicated IBKR bridge for futures live data. It uses the TWS API historical-bar subscription mode (`reqHistoricalData(... keepUpToDate=true)`) so it can emit finalized 1-minute candles directly into the training/signal engine.

Setup:

```bash
cp .env.ibkr.bridge.example .env.ibkr.bridge
# update IBKR_HOST / IBKR_PORT / IBKR_CLIENT_ID and symbols as needed
python3 -m pip install -r requirements-ibkr.txt
```

Run the bridge:

```bash
npm run bridge:ibkr
```

Historical CSV pulls from IBKR use the same credentials/session and write into `data/historical/ibkr` by default:

```bash
npm run fetch:ibkr -- \
  --symbols NQ,ES \
  --start 2026-01-01T00:00:00Z \
  --end 2026-03-12T00:00:00Z \
  --timeframe 5m
```

IBKR notes that API market data still requires the correct market-data subscriptions and the Market Data API acknowledgement in the account.

### Optional pull mode (if you expose a bar feed URL)

Set:

- `CONTINUOUS_TRAINING_POLL_URL=https://your-feed.example.com/bars`
- `CONTINUOUS_TRAINING_POLL_SECONDS=60`
- optional auth: `CONTINUOUS_TRAINING_POLL_API_KEY`, `CONTINUOUS_TRAINING_POLL_API_KEY_HEADER`

## Databento Live Data Bridge (recommended)

Use this when Tradovate API app credentials are unavailable. The bridge polls Databento 1-minute OHLCV and pushes bars to:

- `POST /training/ingest-bars`

### Start Databento bridge

```bash
cp .env.databento.bridge.example .env.databento.bridge
# edit .env.databento.bridge with your Databento API key + symbols
npm run bridge:databento
```

Important env vars:

- `DATABENTO_BRIDGE_ENABLED=true|false`
- `DATABENTO_API_KEY` (required)
- `DATABENTO_DATASET=GLBX.MDP3`
- `DATABENTO_SCHEMA=ohlcv-1m`
- `DATABENTO_STYPE_IN=continuous` (or `parent`, etc.)
- `DATABENTO_BRIDGE_SYMBOLS=NQ.c.0,ES.c.0`
- `DATABENTO_SYMBOL_MAP` optional JSON override, example: `{"NQ.C.0":"NQ","ES.C.0":"ES"}`
- `DATABENTO_POLL_SECONDS=60`
- `TRAINING_API_BASE_URL=http://127.0.0.1:3000`
- `DATABENTO_BRIDGE_ENV_FILE=path/to/file` (optional, defaults to `.env.databento.bridge`)

## Yahoo Live Data Bridge (free)

Use this bridge when you need zero-cost live ingestion (typically delayed index data). It polls Yahoo chart candles and forwards closed bars to:

- `POST /training/ingest-bars`

### Start Yahoo bridge

```bash
cp .env.yahoo.bridge.example .env.yahoo.bridge
# edit .env.yahoo.bridge if you want different symbols/mapping
npm run bridge:yahoo
```

Important env vars:

- `YAHOO_BRIDGE_ENABLED=true|false`
- `YAHOO_BRIDGE_SYMBOLS=NQ=F,ES=F`
- `YAHOO_BRIDGE_SYMBOL_MAP` optional JSON mapping, example: `{"NQ=F":"NQ","ES=F":"ES"}`
- `YAHOO_INTERVAL=1m`
- `YAHOO_RANGE=1d`
- `YAHOO_POLL_SECONDS=60`
- `TRAINING_API_BASE_URL=http://127.0.0.1:3000`
- `YAHOO_BASE_URL=https://query2.finance.yahoo.com`
- `YAHOO_USER_AGENT=Mozilla/5.0`
- `YAHOO_REQUEST_RETRIES=3`
- `YAHOO_FORCE_CURL=true|false` (set `true` if Yahoo blocks Node fetch with HTTP 429)
- `YAHOO_BRIDGE_ENV_FILE=path/to/file` (optional, defaults to `.env.yahoo.bridge`)

Notes:

- Yahoo free data is usually delayed and can be rate-limited.
- For funded execution decisions, treat this as assist/research grade unless you validate latency/accuracy.

## Tradovate Auto Data Bridge (no manual bar uploads)

The bridge connects to Tradovate market data WebSocket, listens for 1-minute chart updates, and automatically posts finalized bars to:

- `POST /training/ingest-bars`

### Start the bridge

```bash
cp .env.bridge.example .env.bridge
# edit .env.bridge with your credentials
npm run bridge:tradovate
```

Important bridge env vars:

- `TRADOVATE_BRIDGE_ENABLED=true|false`
- `TRADOVATE_API_URL=https://demo.tradovateapi.com/v1` (or your live API URL)
- `TRADOVATE_MD_WS_URL=wss://md.tradovateapi.com/v1/websocket`
- `TRADOVATE_USERNAME`
- `TRADOVATE_PASSWORD`
- `TRADOVATE_APP_ID` (optional, if your account requires API app credentials)
- `TRADOVATE_APP_VERSION` (optional)
- `TRADOVATE_CID` (optional)
- `TRADOVATE_SEC` (optional)
- `TRADOVATE_BRIDGE_SYMBOLS=comma,separated,contracts` (example: `NQM6,ESM6`)
- `TRADOVATE_SYMBOL_MAP` optional JSON mapping to internal symbols  
  example: `{"NQM6":"NQ","ESM6":"ES"}`
- `TRADOVATE_CHART_HISTORY_BARS=300`
- `TRAINING_API_BASE_URL=http://127.0.0.1:3000`
- `TRAINING_API_KEY` and `TRAINING_API_KEY_HEADER` (optional if your API is protected)
- `BRIDGE_ENV_FILE=path/to/envfile` (optional, defaults to `.env.bridge`)

Use active front-month futures symbols in `TRADOVATE_BRIDGE_SYMBOLS` and update them at rollover.
If E8 only gave you Tradovate username/password, start with those only. Add `TRADOVATE_APP_ID/CID/SEC` only if auth fails and support provides API credentials.

### Run server + bridge together (recommended on VPS)

Terminal/Process 1:

```bash
npm run start:continuous
```

Terminal/Process 2:

```bash
npm run bridge:tradovate
```

Verify continuous learning:

```bash
curl http://127.0.0.1:3000/training/status
```

### GitHub Actions deploy to VPS

The repo root includes a workflow at `.github/workflows/deploy-vps.yml` that can deploy directly to the VPS on every push to `main` or by manual dispatch.

Required GitHub repository secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PORT` (optional, defaults to `22`)

The workflow:

- runs `npm ci`
- runs `npm run build`
- runs `npm test`
- runs `bash scripts/deploy-vps.sh`

## Mobile app options

### PWA (install from browser)

A mobile installable web app is available at `/mobile`.

1. Run the server (`npm run dev`) on your machine or VPS.
2. Open `http://<host>:3000/mobile` on your phone.
3. Use browser \"Add to Home Screen\" / \"Install App\".

Features:

- pending manual approvals (`/execution/pending`)
- one-tap approve-and-log for external manual execution
- recent trade journal view
- configurable API base URL
- iOS-style command deck UI with tabbed navigation

Optional package artifact:

```bash
npm run package:mobile
```

This creates `releases/trading-mobile-pwa.zip`.

### Native iOS app (Capacitor wrapper)

This repo now includes a native iOS project scaffold in `ios/` using Capacitor.

1. Sync web assets into iOS:

```bash
npm run ios:sync
```

2. Open in Xcode:

```bash
npm run ios:open
```

3. In Xcode:
- choose your Apple Team/signing
- select a simulator or connected iPhone
- Run

Notes:
- For local non-HTTPS API testing, `NSAppTransportSecurity` is enabled to allow HTTP in the generated iOS app.
- For production, use HTTPS API endpoints.

### Instant mobile UI updates (no app rebuild)

The native iOS wrapper is configured to load the live URL by default:

- `https://167-172-252-171.sslip.io/mobile/`

That means UI changes deployed to the server are visible on phone refresh immediately.

Optional override before syncing iOS:

```bash
CAP_SERVER_URL="https://your-server/mobile/" npm run ios:sync
```

## Run (once Node is installed)

```bash
npm install
npm test
npm run dev
```
