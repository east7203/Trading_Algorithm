# Trading Algorithm

Trading support system for futures-focused setup detection, risk filtering, review capture, continuous model training, and cross-device alerts.

## What this repo contains

The active application lives in [Trading_Algorithm_v1](./Trading_Algorithm_v1).

Core capabilities:

- live signal detection for futures workflows
- manual-execution approval flow
- IBKR recovery and reconnect handling
- iPhone web push, Telegram, and Mac alert delivery
- review loop and continuous ranking-model training
- mobile dashboard for signals, reviews, settings, and system status

## Project layout

- [Trading_Algorithm_v1/README.md](./Trading_Algorithm_v1/README.md): full product and runtime documentation
- `Trading_Algorithm_v1/src`: API, signal engine, training loop, integrations
- `Trading_Algorithm_v1/mobile`: hosted mobile UI
- `Trading_Algorithm_v1/desktop`: Mac notifier and desktop shell
- `Trading_Algorithm_v1/scripts`: deployment, IBKR, and operational scripts
- `Trading_Algorithm_v1/tests`: unit and integration coverage

## Quick start

```bash
cd Trading_Algorithm_v1
npm install
npm run build
npm test
npm run dev
```

## Deployment

VPS deploy script:

```bash
cd Trading_Algorithm_v1
npm run deploy:vps
```

## Notes

- The repo root is intentionally lightweight.
- The product code, tests, and operational scripts are all under `Trading_Algorithm_v1/`.
