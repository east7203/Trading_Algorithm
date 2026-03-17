import { describe, expect, it } from 'vitest';
import { evaluateRisk } from '../../src/services/riskEngine.js';
import { RiskConfigStore } from '../../src/stores/riskConfigStore.js';
import type { RiskCheckInput, SetupCandidate } from '../../src/domain/types.js';

const candidate: SetupCandidate = {
  id: 'candidate-risk',
  setupType: 'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION',
  symbol: 'NAS100',
  session: 'NY',
  detectionTimeframe: '15m',
  executionTimeframe: '5m',
  side: 'LONG',
  entry: 100,
  stopLoss: 99,
  takeProfit: [101.5, 102.5],
  baseScore: 70,
  oneMinuteConfidence: 0.6,
  eligibility: {
    passed: true,
    passReasons: ['pass'],
    failReasons: []
  },
  metadata: {},
  generatedAt: '2026-03-07T15:00:00.000Z'
};

const baseInput = (): RiskCheckInput => ({
  candidate,
  account: {
    equity: 100_000,
    dailyLossPct: 0.2,
    sessionLossPct: 0.1,
    consecutiveLosses: 0
  },
  market: {
    spreadPoints: 0.5,
    expectedSlippagePoints: 0.3
  },
  now: '2026-03-07T15:00:00.000Z',
  newsEvents: []
});

describe('evaluateRisk', () => {
  it('uses default 0.50% per-trade risk when request is absent', () => {
    const store = new RiskConfigStore();
    store.patch({
      policyConfirmation: {
        firmUsageApproved: true,
        platformUsageApproved: true,
        confirmedBy: 'tester',
        confirmedAt: '2026-03-07T14:00:00.000Z'
      }
    });

    const decision = evaluateRisk(baseInput(), store.get());
    expect(decision.allowed).toBe(true);
    expect(decision.finalRiskPct).toBe(0.5);
    expect(decision.blockedByTradingWindow).toBe(false);
  });

  it('enforces hard max cap of 1.00% risk', () => {
    const store = new RiskConfigStore();
    store.patch({
      policyConfirmation: {
        firmUsageApproved: true,
        platformUsageApproved: true,
        confirmedBy: 'tester',
        confirmedAt: '2026-03-07T14:00:00.000Z'
      }
    });

    const decision = evaluateRisk(
      {
        ...baseInput(),
        requestedRiskPct: 1.7
      },
      store.get()
    );

    expect(decision.finalRiskPct).toBe(1);
    expect(decision.reasonCodes).toContain('RISK_CLAMPED_TO_USER_MAX');
    expect(decision.finalRiskPct).toBeLessThanOrEqual(1);
  });

  it('blocks when daily loss cap is reached', () => {
    const store = new RiskConfigStore();
    store.patch({
      policyConfirmation: {
        firmUsageApproved: true,
        platformUsageApproved: true,
        confirmedBy: 'tester',
        confirmedAt: '2026-03-07T14:00:00.000Z'
      }
    });

    const decision = evaluateRisk(
      {
        ...baseInput(),
        account: {
          ...baseInput().account,
          dailyLossPct: 2
        }
      },
      store.get()
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reasonCodes).toContain('DAILY_LOSS_CAP_REACHED');
  });

  it('blocks within strict high-impact USD news window', () => {
    const store = new RiskConfigStore();
    store.patch({
      policyConfirmation: {
        firmUsageApproved: true,
        platformUsageApproved: true,
        confirmedBy: 'tester',
        confirmedAt: '2026-03-07T14:00:00.000Z'
      }
    });

    const decision = evaluateRisk(
      {
        ...baseInput(),
        now: '2026-03-07T15:10:00.000Z',
        newsEvents: [
          {
            currency: 'USD',
            impact: 'high',
            startsAt: '2026-03-07T15:20:00.000Z',
            source: 'paid-economic-calendar-api'
          }
        ]
      },
      store.get()
    );

    expect(decision.allowed).toBe(false);
    expect(decision.blockedByNewsWindow).toBe(true);
    expect(decision.reasonCodes).toContain('HIGH_IMPACT_USD_NEWS_WINDOW_BLOCK');
  });

  it('blocks outside configured morning trading window', () => {
    const store = new RiskConfigStore();
    store.patch({
      policyConfirmation: {
        firmUsageApproved: true,
        platformUsageApproved: true,
        confirmedBy: 'tester',
        confirmedAt: '2026-03-07T14:00:00.000Z'
      }
    });

    const decision = evaluateRisk(
      {
        ...baseInput(),
        now: '2026-03-07T18:00:00.000Z'
      },
      store.get()
    );

    expect(decision.allowed).toBe(false);
    expect(decision.blockedByTradingWindow).toBe(true);
    expect(decision.reasonCodes).toContain('OUTSIDE_ALLOWED_TRADING_WINDOW');
  });
});

describe('RiskConfigStore', () => {
  it('rejects max risk above 1.00%', () => {
    const store = new RiskConfigStore();
    expect(() => store.patch({ perTradeRiskPctMax: 1.2 })).toThrow(
      'perTradeRiskPctMax cannot exceed hard cap of 1.00%'
    );
  });

  it('rejects invalid trading window timezone', () => {
    const store = new RiskConfigStore();
    expect(() => store.patch({ tradingWindow: { timezone: 'Bad/Timezone' } })).toThrow(
      'Trading window timezone is invalid'
    );
  });
});
