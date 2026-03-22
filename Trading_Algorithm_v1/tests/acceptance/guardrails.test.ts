import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const candidate = {
  id: 'candidate-acceptance-1',
  setupType: 'NY_BREAK_RETEST_MOMENTUM',
  symbol: 'NQ',
  session: 'NY',
  detectionTimeframe: '5m',
  executionTimeframe: '5m',
  side: 'LONG',
  entry: 100,
  stopLoss: 99,
  takeProfit: [101.5, 102.5],
  baseScore: 72,
  oneMinuteConfidence: 0.7,
  eligibility: {
    passed: true,
    passReasons: ['pass'],
    failReasons: []
  },
  metadata: {},
  generatedAt: '2026-03-07T15:00:00.000Z'
};

const account = {
  equity: 100_000,
  dailyLossPct: 0.4,
  sessionLossPct: 0.2,
  consecutiveLosses: 0
};

const market = {
  spreadPoints: 0.7,
  expectedSlippagePoints: 0.4
};

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

const confirmPolicy = async (ctx: AppContext): Promise<void> => {
  const response = await ctx.app.inject({
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

  expect(response.statusCode).toBe(200);
};

describe('acceptance guardrails', () => {
  it('keeps zero automated orders (manual approval does not send broker API orders)', async () => {
    const ctx = withApp();
    await confirmPolicy(ctx);

    const riskResponse = await ctx.app.inject({
      method: 'POST',
      path: '/risk/check',
      payload: {
        candidate,
        account,
        market,
        now: '2026-03-07T15:00:00.000Z',
        requestedRiskPct: 0.5,
        newsEvents: []
      }
    });

    expect(riskResponse.statusCode).toBe(200);
    const riskBody = riskResponse.json();
    expect(riskBody.decision.allowed).toBe(true);

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
    const ordersBeforeApprove = await ctx.tradeLockerClient.listOrders();
    expect(ordersBeforeApprove).toHaveLength(0);

    const proposeBody = proposeResponse.json();

    const approveResponse = await ctx.app.inject({
      method: 'POST',
      path: '/execution/approve',
      payload: {
        intentId: proposeBody.intent.intentId,
        approvedBy: 'manual-reviewer',
        manualChecklistConfirmed: true,
        paperAccountConfirmed: true,
        now: '2026-03-07T15:02:00.000Z'
      }
    });

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json().intent.status).toBe('APPROVED');
    const ordersAfterApprove = await ctx.tradeLockerClient.listOrders();
    expect(ordersAfterApprove).toHaveLength(0);
  });

  it('keeps zero risk cap violations (final risk never above 1.00%)', async () => {
    const ctx = withApp();
    await confirmPolicy(ctx);

    const riskResponse = await ctx.app.inject({
      method: 'POST',
      path: '/risk/check',
      payload: {
        candidate,
        account,
        market,
        now: '2026-03-07T15:00:00.000Z',
        requestedRiskPct: 3,
        newsEvents: []
      }
    });

    expect(riskResponse.statusCode).toBe(200);
    const riskBody = riskResponse.json();
    expect(riskBody.decision.finalRiskPct).toBeLessThanOrEqual(1);
  });

  it('keeps zero orders during blocked high-impact news windows', async () => {
    const ctx = withApp();
    await confirmPolicy(ctx);

    const riskResponse = await ctx.app.inject({
      method: 'POST',
      path: '/risk/check',
      payload: {
        candidate,
        account,
        market,
        now: '2026-03-07T15:10:00.000Z',
        requestedRiskPct: 0.5,
        newsEvents: [
          {
            currency: 'USD',
            impact: 'high',
            startsAt: '2026-03-07T15:20:00.000Z',
            source: 'paid-economic-calendar-api'
          }
        ]
      }
    });

    expect(riskResponse.statusCode).toBe(200);
    const riskBody = riskResponse.json();
    expect(riskBody.decision.allowed).toBe(false);

    const proposeResponse = await ctx.app.inject({
      method: 'POST',
      path: '/execution/propose',
      payload: {
        candidate,
        riskDecision: riskBody.decision,
        now: '2026-03-07T15:11:00.000Z'
      }
    });

    expect(proposeResponse.statusCode).toBe(400);
    const orders = await ctx.tradeLockerClient.listOrders();
    expect(orders).toHaveLength(0);
  });
});
