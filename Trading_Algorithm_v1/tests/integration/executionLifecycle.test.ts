import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const contexts: AppContext[] = [];

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }
});

const withApp = (): AppContext => {
  const ctx = buildApp();
  contexts.push(ctx);
  return ctx;
};

const candidate = {
  id: 'candidate-int-1',
  setupType: 'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
  symbol: 'YM',
  session: 'NY',
  detectionTimeframe: '5m',
  executionTimeframe: '5m',
  side: 'SHORT',
  entry: 39000,
  stopLoss: 39040,
  takeProfit: [38940, 38900],
  baseScore: 75,
  oneMinuteConfidence: 0.6,
  eligibility: {
    passed: true,
    passReasons: ['pass'],
    failReasons: []
  },
  metadata: {},
  generatedAt: '2026-03-07T15:00:00.000Z'
};

describe('execution lifecycle integration', () => {
  it('is idempotent on repeated approve calls for same intent', async () => {
    const ctx = withApp();

    const patchResponse = await ctx.app.inject({
      method: 'PATCH',
      path: '/risk/config',
      payload: {
        policyConfirmation: {
          firmUsageApproved: true,
          platformUsageApproved: true,
          confirmedBy: 'qa-user',
          confirmedAt: '2026-03-07T14:00:00.000Z'
        }
      }
    });
    expect(patchResponse.statusCode).toBe(200);

    const riskResponse = await ctx.app.inject({
      method: 'POST',
      path: '/risk/check',
      payload: {
        candidate,
        account: {
          equity: 100_000,
          dailyLossPct: 0.1,
          sessionLossPct: 0.1,
          consecutiveLosses: 0
        },
        market: {
          spreadPoints: 0.3,
          expectedSlippagePoints: 0.2
        },
        now: '2026-03-07T15:00:00.000Z',
        requestedRiskPct: 0.5,
        newsEvents: []
      }
    });

    expect(riskResponse.statusCode).toBe(200);
    const riskBody = riskResponse.json();

    const proposeResponse = await ctx.app.inject({
      method: 'POST',
      path: '/execution/propose',
      payload: {
        candidate,
        riskDecision: riskBody.decision,
        now: '2026-03-07T15:01:00.000Z'
      }
    });

    expect(proposeResponse.statusCode).toBe(200);
    const intent = proposeResponse.json().intent;

    const pendingBeforeApprove = await ctx.app.inject({
      method: 'GET',
      path: '/execution/pending'
    });
    expect(pendingBeforeApprove.statusCode).toBe(200);
    expect(pendingBeforeApprove.json().intents).toHaveLength(1);

    const approve1 = await ctx.app.inject({
      method: 'POST',
      path: '/execution/approve',
      payload: {
        intentId: intent.intentId,
        approvedBy: 'reviewer',
        manualChecklistConfirmed: true,
        paperAccountConfirmed: true,
        now: '2026-03-07T15:02:00.000Z'
      }
    });

    expect(approve1.statusCode).toBe(200);
    expect(approve1.json().intent.status).toBe('APPROVED');
    expect(approve1.json().intent.orderId).toBeUndefined();

    const approve2 = await ctx.app.inject({
      method: 'POST',
      path: '/execution/approve',
      payload: {
        intentId: intent.intentId,
        approvedBy: 'reviewer',
        manualChecklistConfirmed: true,
        paperAccountConfirmed: true,
        now: '2026-03-07T15:03:00.000Z'
      }
    });

    expect(approve2.statusCode).toBe(200);
    expect(approve2.json().intent.status).toBe('APPROVED');
    expect(approve2.json().intent.intentId).toBe(intent.intentId);
    const orders = await ctx.tradeLockerClient.listOrders();
    expect(orders).toHaveLength(0);

    const pendingAfterApprove = await ctx.app.inject({
      method: 'GET',
      path: '/execution/pending'
    });
    expect(pendingAfterApprove.statusCode).toBe(200);
    expect(pendingAfterApprove.json().intents).toHaveLength(0);
  });

  it('rejects approval when checklist confirmation is missing', async () => {
    const ctx = withApp();

    const patchResponse = await ctx.app.inject({
      method: 'PATCH',
      path: '/risk/config',
      payload: {
        policyConfirmation: {
          firmUsageApproved: true,
          platformUsageApproved: true,
          confirmedBy: 'qa-user',
          confirmedAt: '2026-03-07T14:00:00.000Z'
        }
      }
    });
    expect(patchResponse.statusCode).toBe(200);

    const riskResponse = await ctx.app.inject({
      method: 'POST',
      path: '/risk/check',
      payload: {
        candidate,
        account: {
          equity: 100_000,
          dailyLossPct: 0.1,
          sessionLossPct: 0.1,
          consecutiveLosses: 0
        },
        market: {
          spreadPoints: 0.3,
          expectedSlippagePoints: 0.2
        },
        now: '2026-03-07T15:00:00.000Z',
        requestedRiskPct: 0.5,
        newsEvents: []
      }
    });
    expect(riskResponse.statusCode).toBe(200);

    const proposeResponse = await ctx.app.inject({
      method: 'POST',
      path: '/execution/propose',
      payload: {
        candidate,
        riskDecision: riskResponse.json().decision,
        now: '2026-03-07T15:01:00.000Z'
      }
    });
    expect(proposeResponse.statusCode).toBe(200);

    const approve = await ctx.app.inject({
      method: 'POST',
      path: '/execution/approve',
      payload: {
        intentId: proposeResponse.json().intent.intentId,
        approvedBy: 'reviewer',
        manualChecklistConfirmed: false,
        paperAccountConfirmed: true,
        now: '2026-03-07T15:02:00.000Z'
      }
    });

    expect(approve.statusCode).toBe(400);
    expect(approve.json().message).toContain('Invalid');
  });
});
