# Architecture

## System Goals

The system is designed for discretionary futures trading support, not blind execution automation.

Primary goals:

- detect structured `NQ` / `ES` setups from live bars
- keep alerts constrained by explicit risk and macro rules
- learn from outcomes and operator feedback
- remain usable when broker connectivity is imperfect
- expose system state clearly to the operator on mobile

## Data Flow

1. A live bridge ingests `1m` bars from IBKR.
2. Bars are archived and fanned into the signal monitor.
3. The signal monitor builds `5m`, `15m`, `1H`, `4H`, `D1`, and `W1` context.
4. Setup detectors produce normalized `SetupCandidate` objects.
5. Macro/news context and risk policy adjust or block candidates.
6. The ranking model orders surviving candidates.
7. Alerts are published to the operator.
8. Reviews and outcomes feed back into retraining.

## Detection Model

The project uses a multi-setup portfolio model rather than a single “master strategy.”

Examples currently in the codebase:

- liquidity sweep -> MSS -> FVG continuation
- liquidity sweep reversal from session extremes
- displacement + order-block retest continuation
- NY break-and-retest momentum
- Werlein-style higher-timeframe liquidity + SMT setup

This separation matters because it lets the ranking model learn preferences across setup families instead of conflating them.

## Timeframe Design

The alerting layer is intentionally split:

- **alert timeframe:** `5m`
- **context timeframe:** `15m` and above

That reflects the actual use case:

- entries should be timely enough to act on
- but the system still needs higher-timeframe structure to avoid low-quality noise

## Training Model

The ranking model is retrained continuously on the VPS.

Training inputs include:

- historical bar-derived examples
- live bar-derived examples
- auto-labeled outcomes
- operator review feedback

The model is therefore not a fixed static score card. It is an adapting ranker over a stable ruleset.

## Macro / News Layer

The macro layer is a separate context service rather than an ad hoc check scattered through the code.

Responsibilities:

- fetch calendar events from the provider
- determine relevance to `NQ` / `ES`
- classify severity
- apply score penalties or hard blocks near events

This keeps the signal engine honest about the fact that futures setups exist inside scheduled macro risk.

## Recovery / Operations Layer

Broker recovery is part of the product, not an afterthought.

The VPS recovery stack tracks:

- login-required events
- reconnect attempts
- reminder state
- connected state
- Telegram / app notifications

This is important because in a live trading-support system, silent failure is one of the worst failure modes.

## Tradeoffs

### Manual execution over automated routing
This project prioritizes signal quality, reviewability, and operational clarity over order-routing complexity.

### VPS-first runtime
The system is designed to keep the active runtime on the VPS so the operator’s laptop or phone is not the control plane.

### Rule-first, model-second
The model ranks eligible setups. It does not replace risk rules or macro filters.

## What I Would Improve Next

- richer setup attribution in alerts and review summaries
- cleaner provider redundancy for macro-calendar ingestion
- more explicit performance dashboards by setup family and session regime
- stronger deploy packaging so the VPS path is less sensitive to local build artifacts
