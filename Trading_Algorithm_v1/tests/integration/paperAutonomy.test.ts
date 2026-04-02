import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const contexts: AppContext[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

const buildAutonomyTrendBars = (
  symbol: 'NQ' | 'ES' = 'NQ',
  count = 420,
  startAt = '2026-01-06T09:00:00.000Z'
) => {
  const bars = [];
  const startMs = Date.parse(startAt);

  for (let index = 0; index < count; index += 1) {
    const trend = index * 0.18;
    const pullback = Math.sin(index / 8) * 0.42;
    const impulse = index > 260 ? (index - 260) * 0.05 : 0;
    const close = 20000 + trend + pullback + impulse;
    const open = close - 0.08;
    const high = close + 0.16 + (index > 300 ? 0.06 : 0);
    const low = close - 0.2;

    bars.push({
      symbol,
      timestamp: new Date(startMs + index * 60_000).toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 100 + index
    });
  }

  return bars;
};

describe('paper autonomy integration', () => {
  it('opens paper trades directly from its own research and bar state with the personal engine disabled', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-autonomy-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
      marketResearchEnabled: false,
      paperTradingEnabled: true,
      paperAutonomyEnabled: true,
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0,
        autonomyRiskPct: 0.5
      },
      paperAutonomyConfig: {
        statePath: path.join(tempDir, 'paper-autonomy.json'),
        archivePath: undefined,
        bootstrapCsvDir: undefined,
        minTrendConfidence: 0.55,
        maxHoldMinutes: 120
      }
    });
    contexts.push(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildAutonomyTrendBars()
      }
    });

    expect(ingest.statusCode).toBe(200);
    const ingestPayload = ingest.json();
    expect(ingestPayload.signalMonitor.enabled).toBe(false);
    expect(ingestPayload.paperAutonomy.enabled).toBe(true);
    expect(ingestPayload.paperAutonomyIngest.ideasOpened).toBeGreaterThan(0);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });
    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json().alerts).toHaveLength(0);

    const paperStatus = await ctx.app.inject({
      method: 'GET',
      path: '/paper-account/status'
    });

    expect(paperStatus.statusCode).toBe(200);
    const paperAccount = paperStatus.json().paperAccount;
    expect(paperAccount.enabled).toBe(true);
    expect(
      (paperAccount.pendingEntries ?? 0)
        + (paperAccount.openTrades ?? 0)
        + (paperAccount.closedTrades ?? 0)
        + (paperAccount.canceledTrades ?? 0)
    ).toBeGreaterThan(0);

    const autonomyStatus = await ctx.app.inject({
      method: 'GET',
      path: '/paper-autonomy/status'
    });

    expect(autonomyStatus.statusCode).toBe(200);
    const paperAutonomy = autonomyStatus.json().paperAutonomy;
    expect(paperAutonomy.enabled).toBe(true);
    expect(paperAutonomy.totalIdeas).toBeGreaterThan(0);
    expect(paperAutonomy.recentIdeas[0].thesis).toBeTruthy();
    expect(typeof paperAutonomy.recentIdeas[0].reason).toBe('string');
    expect(Array.isArray(paperAutonomy.symbolStatus)).toBe(true);
    expect(typeof paperAutonomy.symbolStatus[0].reason).toBe('string');
  });

  it('learns thesis performance from closed autonomous paper trades', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-autonomy-learning-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
      marketResearchEnabled: false,
      paperTradingEnabled: true,
      paperAutonomyEnabled: true,
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0,
        autonomyRiskPct: 0.5
      },
      paperAutonomyConfig: {
        statePath: path.join(tempDir, 'paper-autonomy.json'),
        archivePath: undefined,
        bootstrapCsvDir: undefined,
        minTrendConfidence: 0.55,
        maxHoldMinutes: 60
      }
    });
    contexts.push(ctx);

    const initialBars = buildAutonomyTrendBars('NQ', 420);
    const openResponse = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: { bars: initialBars }
    });
    expect(openResponse.statusCode).toBe(200);
    expect(openResponse.json().paperAutonomyIngest.ideasOpened).toBeGreaterThan(0);

    const lastTimestamp = Date.parse(initialBars.at(-1)?.timestamp ?? '2026-01-06T18:29:00.000Z');
    const exitBars = Array.from({ length: 30 }, (_, index) => {
      const close = 20070 + index * 0.9;
      return {
        symbol: 'NQ' as const,
        timestamp: new Date(lastTimestamp + (index + 1) * 60_000).toISOString(),
        open: Number((close - 0.12).toFixed(2)),
        high: Number((close + 1.0).toFixed(2)),
        low: Number((close - 0.18).toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: 600 + index
      };
    });

    const settleResponse = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: { bars: exitBars }
    });
    expect(settleResponse.statusCode).toBe(200);

    const autonomyStatus = await ctx.app.inject({
      method: 'GET',
      path: '/paper-autonomy/status'
    });
    expect(autonomyStatus.statusCode).toBe(200);

    const paperAutonomy = autonomyStatus.json().paperAutonomy;
    expect(paperAutonomy.closedIdeas).toBeGreaterThan(0);
    expect(Array.isArray(paperAutonomy.thesisStats)).toBe(true);
    expect(paperAutonomy.thesisStats.some((entry: { closed: number }) => entry.closed > 0)).toBe(true);

    const reviewsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/reviews?status=ALL&limit=20'
    });
    expect(reviewsResponse.statusCode).toBe(200);
    expect(
      reviewsResponse
        .json()
        .reviews.some((review: { autoLabeledBy?: string; autoOutcome?: string }) => (
          review.autoLabeledBy === 'paper-trading-engine'
          && (review.autoOutcome === 'WOULD_WIN' || review.autoOutcome === 'WOULD_LOSE')
        ))
    ).toBe(true);
  });

  it('does not open autonomous futures ideas outside the desk-session window', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-autonomy-after-hours-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
      marketResearchEnabled: false,
      paperTradingEnabled: true,
      paperAutonomyEnabled: true,
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0,
        autonomyRiskPct: 0.5
      },
      paperAutonomyConfig: {
        statePath: path.join(tempDir, 'paper-autonomy.json'),
        archivePath: undefined,
        bootstrapCsvDir: undefined,
        minTrendConfidence: 0.55,
        maxHoldMinutes: 120
      }
    });
    contexts.push(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildAutonomyTrendBars('NQ', 330, '2026-01-06T22:00:00.000Z')
      }
    });

    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().paperAutonomyIngest.ideasOpened).toBe(0);

    const autonomyStatus = ctx.paperAutonomyService?.status();
    expect(autonomyStatus?.totalIdeas ?? 0).toBe(0);
  });

  it('defaults the paper autonomy session to the desk window', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-autonomy-window-sync-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
      marketResearchEnabled: false,
      paperTradingEnabled: true,
      paperAutonomyEnabled: true,
      signalMonitorConfig: {
        sessionStartHour: 9,
        sessionStartMinute: 15,
        sessionEndHour: 11,
        sessionEndMinute: 5
      },
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0,
        autonomyRiskPct: 0.5
      },
      paperAutonomyConfig: {
        statePath: path.join(tempDir, 'paper-autonomy.json'),
        archivePath: undefined,
        bootstrapCsvDir: undefined
      }
    });
    contexts.push(ctx);
    await ctx.paperTradingService?.start();
    await ctx.paperAutonomyService?.start();

    const autonomyStatus = ctx.paperAutonomyService?.status();
    expect(autonomyStatus?.session.startHour).toBe(9);
    expect(autonomyStatus?.session.startMinute).toBe(15);
    expect(autonomyStatus?.session.endHour).toBe(11);
    expect(autonomyStatus?.session.endMinute).toBe(5);
  });

  it('resets the paper account back to 100K and clears open autonomy ideas', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-autonomy-reset-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
      marketResearchEnabled: false,
      paperTradingEnabled: true,
      paperAutonomyEnabled: true,
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        initialBalance: 100_000,
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0,
        autonomyRiskPct: 0.5
      },
      paperAutonomyConfig: {
        statePath: path.join(tempDir, 'paper-autonomy.json'),
        archivePath: undefined,
        bootstrapCsvDir: undefined,
        sessionStartHour: 0,
        sessionStartMinute: 0,
        sessionEndHour: 23,
        sessionEndMinute: 59
      }
    });
    contexts.push(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildAutonomyTrendBars('NQ', 420, '2026-01-06T09:00:00.000Z')
      }
    });
    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().paperAutonomyIngest.ideasOpened).toBeGreaterThan(0);

    const reset = await ctx.app.inject({
      method: 'POST',
      path: '/paper-account/reset'
    });
    expect(reset.statusCode).toBe(200);

    const payload = reset.json();
    expect(payload.paperAccount.balance).toBe(100_000);
    expect(payload.paperAccount.equity).toBe(100_000);
    expect(payload.paperAccount.openTrades).toBe(0);
    expect(payload.paperAccount.pendingEntries).toBe(0);
    expect(payload.paperAutonomy.openIdeas).toBe(0);
  });
});
