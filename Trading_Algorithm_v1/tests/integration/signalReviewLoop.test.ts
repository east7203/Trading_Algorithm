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

const buildMomentumBars = () => {
  const bars = [];
  const startMs = Date.parse('2026-01-06T13:30:00.000Z');

  for (let i = 0; i < 60; i += 1) {
    const base = 99.7 + ((i % 6) - 3) * 0.03;
    bars.push({
      symbol: 'NQ',
      timestamp: new Date(startMs + i * 60_000).toISOString(),
      open: Number((base - 0.03).toFixed(2)),
      high: Number(Math.min(100, base + 0.12).toFixed(2)),
      low: Number((base - 0.12).toFixed(2)),
      close: Number(base.toFixed(2)),
      volume: 10 + i
    });
  }

  const breakCloses = [100.1, 100.3, 100.5, 100.8, 101.0];
  breakCloses.forEach((close, idx) => {
    bars.push({
      symbol: 'NQ',
      timestamp: new Date(startMs + (60 + idx) * 60_000).toISOString(),
      open: Number((close - 0.15).toFixed(2)),
      high: Number((close + 0.18).toFixed(2)),
      low: 99.95,
      close,
      volume: 100 + idx
    });
  });

  const retest = [
    { open: 100.95, high: 101.05, low: 100.4, close: 100.8 },
    { open: 100.8, high: 100.85, low: 100.1, close: 100.5 },
    { open: 100.5, high: 100.55, low: 99.8, close: 100.1 },
    { open: 100.1, high: 100.35, low: 99.9, close: 100.05 },
    { open: 100.05, high: 100.45, low: 99.95, close: 100.4 }
  ];
  retest.forEach((bar, idx) => {
    bars.push({
      symbol: 'NQ',
      timestamp: new Date(startMs + (65 + idx) * 60_000).toISOString(),
      ...bar,
      volume: 110 + idx
    });
  });

  const momentum = [
    { open: 100.2, high: 100.5, low: 100.1, close: 100.4 },
    { open: 100.4, high: 100.8, low: 100.3, close: 100.6 },
    { open: 100.6, high: 101.0, low: 100.55, close: 100.9 },
    { open: 100.9, high: 101.25, low: 100.8, close: 101.2 },
    { open: 101.2, high: 101.6, low: 101.0, close: 101.4 }
  ];
  momentum.forEach((bar, idx) => {
    bars.push({
      symbol: 'NQ',
      timestamp: new Date(startMs + (70 + idx) * 60_000).toISOString(),
      ...bar,
      volume: 120 + idx
    });
  });

  return bars;
};

const withApp = (signalReviewStorePath: string, signalMonitorSettingsStorePath: string): AppContext => {
  const ctx = buildApp({
    signalReviewStorePath,
    signalMonitorSettingsStorePath,
    continuousTrainingEnabled: false,
    signalMonitorEnabled: true,
    signalMonitorConfig: {
      bootstrapCsvDir: undefined,
      archivePath: undefined,
      lookbackBars1m: 60,
      minFinalScore: 0,
      maxBarsPerSymbol: 500
    }
  });
  contexts.push(ctx);
  return ctx;
};

const relaxSignalSettings = async (ctx: AppContext) => {
  const response = await ctx.app.inject({
    method: 'PATCH',
    path: '/signals/config',
    payload: {
      minFinalScore: 0,
      requireOpeningRangeComplete: false,
      aPlusOnlyAfterFirstHour: false,
      aPlusMinScore: 0
    }
  });

  expect(response.statusCode).toBe(200);
};

describe('signal review loop integration', () => {
  it('persists review items, updates them, and exposes diagnostics', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-review-loop-'));
    tempDirs.push(tempDir);
    const storePath = path.join(tempDir, 'signal-reviews.json');
    const settingsPath = path.join(tempDir, 'signal-monitor-settings.json');

    const ctx = withApp(storePath, settingsPath);
    await relaxSignalSettings(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const pendingResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/reviews?status=PENDING&limit=10'
    });
    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.json().summary.pending).toBeGreaterThan(0);

    const review = pendingResponse.json().reviews[0];
    expect(review.alertSnapshot.symbol).toBe('NQ');

    const saveResponse = await ctx.app.inject({
      method: 'POST',
      path: '/signals/reviews',
      payload: {
        alertId: review.alertId,
        validity: 'VALID',
        outcome: 'WOULD_WIN',
        notes: 'Held the break and clean continuation.',
        reviewedBy: 'qa-reviewer'
      }
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().review.reviewStatus).toBe('COMPLETED');
    expect(saveResponse.json().review.outcome).toBe('WOULD_WIN');

    const diagnostics = await ctx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json().diagnostics.reviews.completed).toBeGreaterThan(0);
    expect(diagnostics.json().diagnostics.lastAlert.symbol).toBe('NQ');
    expect(diagnostics.json().diagnostics.learningPerformance.resolvedReviews).toBeGreaterThan(0);

    const learning = await ctx.app.inject({
      method: 'GET',
      path: '/learning/performance'
    });
    expect(learning.statusCode).toBe(200);
    expect(learning.json().performance.bySetup.length).toBeGreaterThan(0);
    expect(learning.json().feedback.manualResolvedReviews).toBeGreaterThan(0);

    const journal = await ctx.app.inject({
      method: 'GET',
      path: '/journal/trades'
    });
    expect(journal.statusCode).toBe(200);
    expect(journal.json().events.some((event) => event.type === 'SIGNAL_REVIEWED')).toBe(true);

    await ctx.app.close();
    contexts.pop();

    const reopened = withApp(storePath, settingsPath);
    const completedResponse = await reopened.app.inject({
      method: 'GET',
      path: '/signals/reviews?status=COMPLETED&limit=10'
    });

    expect(completedResponse.statusCode).toBe(200);
    expect(completedResponse.json().reviews[0].outcome).toBe('WOULD_WIN');
    expect(completedResponse.json().reviews[0].reviewedBy).toBe('qa-reviewer');
  });
});
