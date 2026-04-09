import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';
import { InMemoryEconomicCalendarClient } from '../../src/integrations/news/EconomicCalendarClient.js';

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

const confirmPolicy = async (ctx: AppContext) => {
  const response = await ctx.app.inject({
    method: 'PATCH',
    path: '/risk/config',
    payload: {
      policyConfirmation: {
        firmUsageApproved: true,
        platformUsageApproved: true,
        confirmedBy: 'integration-test',
        confirmedAt: '2026-01-06T13:29:00.000Z'
      }
    }
  });

  expect(response.statusCode).toBe(200);
};

describe('signal monitor integration', () => {
  it('creates live signal alerts from ingested one-minute bars', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-monitor-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      }
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().signalIngest.accepted).toBe(75);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });

    expect(alertsResponse.statusCode).toBe(200);
    const payload = alertsResponse.json();
    expect(payload.alerts.length).toBeGreaterThan(0);

    const top = payload.alerts[0];
    expect(top.symbol).toBe('NQ');
    expect(top.setupType).toBe('NY_BREAK_RETEST_MOMENTUM');
    expect(top.riskDecision.allowed).toBe(false);
    expect(top.riskDecision.reasonCodes).toContain('POLICY_CONFIRMATION_REQUIRED');
    expect(top.candidate.detectionTimeframe).toBe('5m');
    expect(top.candidate.executionTimeframe).toBe('5m');
    expect(top.chartSnapshot.timeframe).toBe('5m');
    expect(top.chartSnapshot.bars.length).toBeGreaterThan(3);
    expect(top.chartSnapshot.generatedAt).toBe(top.detectedAt);
    expect(top.chartSnapshot.referenceLevels.some((level: { key: string }) => level.key === 'entry')).toBe(true);
  });

  it('lets the paper account mirror allowed SMC candidates once the desk policy is confirmed', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-monitor-paper-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      },
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        maxLiveDelayMinutes: 10_000_000
      },
      paperAutonomyEnabled: false
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);
    await confirmPolicy(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const paperStatus = await ctx.app.inject({
      method: 'GET',
      path: '/paper-account/status'
    });

    expect(paperStatus.statusCode).toBe(200);
    const paperAccount = paperStatus.json().paperAccount;
    expect(paperAccount.enabled).toBe(true);
    expect(paperAccount.initialBalance).toBe(100000);
    expect(
      (paperAccount.pendingEntries ?? 0)
      + (paperAccount.openTrades ?? 0)
      + (paperAccount.closedTrades ?? 0)
      + (paperAccount.canceledTrades ?? 0)
    ).toBeGreaterThan(0);
  });

  it('keeps the paper account flat when the manual trading window blocks the signal', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-monitor-paper-window-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      },
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        maxLiveDelayMinutes: 10_000_000,
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0
      },
      paperAutonomyEnabled: false
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);
    await confirmPolicy(ctx);

    const tightenDeskWindow = await ctx.app.inject({
      method: 'PATCH',
      path: '/risk/config',
      payload: {
        tradingWindow: {
          enabled: true,
          timezone: 'America/New_York',
          startHour: 10,
          startMinute: 30,
          endHour: 11,
          endMinute: 30
        }
      }
    });
    expect(tightenDeskWindow.statusCode).toBe(200);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });
    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json().alerts.length).toBeGreaterThan(0);
    expect(
      alertsResponse
        .json()
        .alerts.every((alert: { riskDecision: { blockedByTradingWindow: boolean } }) => alert.riskDecision.blockedByTradingWindow)
    ).toBe(true);

    const paperStatus = await ctx.app.inject({
      method: 'GET',
      path: '/paper-account/status'
    });

    expect(paperStatus.statusCode).toBe(200);
    const paperAccount = paperStatus.json().paperAccount;
    expect(paperAccount.pendingEntries).toBe(0);
    expect(paperAccount.openTrades).toBe(0);
    expect(paperAccount.closedTrades).toBe(0);
    expect(paperAccount.canceledTrades).toBe(0);
  });

  it('lets the paper engine act on observed SMC candidates even when no live alert is published', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-monitor-paper-autonomous-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 100,
        maxBarsPerSymbol: 500
      },
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        maxLiveDelayMinutes: 10_000_000,
        autonomyMode: 'UNRESTRICTED',
        maxConcurrentTrades: 0
      },
      paperAutonomyEnabled: false
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);
    const tightenThreshold = await ctx.app.inject({
      method: 'PATCH',
      path: '/signals/config',
      payload: {
        minFinalScore: 100,
        aPlusOnlyAfterFirstHour: false,
        aPlusMinScore: 100
      }
    });

    expect(tightenThreshold.statusCode).toBe(200);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });
    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json().alerts.length).toBe(0);

    const paperStatus = await ctx.app.inject({
      method: 'GET',
      path: '/paper-account/status'
    });
    expect(paperStatus.statusCode).toBe(200);
    const paperAccount = paperStatus.json().paperAccount;
    expect(
      (paperAccount.pendingEntries ?? 0)
      + (paperAccount.openTrades ?? 0)
      + (paperAccount.closedTrades ?? 0)
      + (paperAccount.canceledTrades ?? 0)
    ).toBeGreaterThan(0);

    const reviewsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/reviews?status=ALL&limit=20'
    });
    expect(reviewsResponse.statusCode).toBe(200);
    expect(reviewsResponse.json().reviews.length).toBeGreaterThan(0);
  });

  it('updates the paper trade concurrency cap through the API, including unlimited mode', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-monitor-paper-config-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      },
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        maxLiveDelayMinutes: 10_000_000,
        maxConcurrentTrades: 3
      }
    });
    contexts.push(ctx);

    const patch = await ctx.app.inject({
      method: 'PATCH',
      path: '/paper-account/config',
      payload: {
        maxConcurrentTrades: 0,
        autonomyMode: 'UNRESTRICTED',
        autonomyRiskPct: 0.5
      }
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().paperAccount.maxConcurrentTrades).toBe(0);
    expect(patch.json().paperAccount.autonomyMode).toBe('UNRESTRICTED');
    expect(patch.json().paperAccount.autonomyRiskPct).toBe(0.5);

    const status = await ctx.app.inject({
      method: 'GET',
      path: '/paper-account/status'
    });

    expect(status.statusCode).toBe(200);
    expect(status.json().paperAccount.maxConcurrentTrades).toBe(0);
    expect(status.json().paperAccount.autonomyMode).toBe('UNRESTRICTED');
    expect(status.json().paperAccount.autonomyRiskPct).toBe(0.5);
  });

  it('auto-labels learning reviews from paper-fed SMC candidates so autonomous paper results train the model', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-monitor-paper-learning-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      },
      paperTradingConfig: {
        statePath: path.join(tempDir, 'paper-account.json'),
        maxLiveDelayMinutes: 10_000_000
      },
      paperAutonomyEnabled: false
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);
    await confirmPolicy(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const settleIngest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: [
          {
            symbol: 'NQ',
            timestamp: '2026-01-06T14:45:00.000Z',
            open: 101.3,
            high: 101.6,
            low: 101.2,
            close: 101.5,
            volume: 150
          },
          {
            symbol: 'NQ',
            timestamp: '2026-01-06T14:46:00.000Z',
            open: 101.5,
            high: 104.2,
            low: 101.4,
            close: 103.9,
            volume: 180
          }
        ]
      }
    });

    expect(settleIngest.statusCode).toBe(200);

    const reviewsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/reviews?status=ALL&limit=20'
    });

    expect(reviewsResponse.statusCode).toBe(200);
    const paperLabeledReview = reviewsResponse
      .json()
      .reviews.find((review: { autoLabeledBy?: string; autoOutcome?: string }) => (
        review.autoLabeledBy === 'paper-trading-engine'
        && review.autoOutcome === 'WOULD_WIN'
      ));

    expect(paperLabeledReview).toBeTruthy();

    const learningResponse = await ctx.app.inject({
      method: 'GET',
      path: '/learning/performance'
    });

    expect(learningResponse.statusCode).toBe(200);
    expect(learningResponse.json().feedback).toBeTruthy();
  });

  it('adds macro-news context to ranked candidates and blocks setups during critical windows', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-macro-news-'));
    tempDirs.push(tempDir);

    const calendarClient = new InMemoryEconomicCalendarClient([
      {
        currency: 'USD',
        impact: 'high',
        startsAt: '2026-01-06T14:45:00.000Z',
        source: 'economic-calendar',
        title: 'US CPI'
      }
    ]);

    const ctx = buildApp({
      calendarClient,
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      }
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);
    await confirmPolicy(ctx);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });

    expect(alertsResponse.statusCode).toBe(200);
    const top = alertsResponse.json().alerts[0];
    expect(top.candidate.metadata.newsAiContextScore).toBeLessThan(0);
    expect(top.candidate.metadata.macroContextSummary).toContain('US CPI');
    expect(top.riskDecision.blockedByNewsWindow).toBe(true);
    expect(top.riskDecision.reasonCodes).toContain('CRITICAL_MACRO_EVENT_WINDOW_BLOCK');
  });

  it('updates signal settings and suppresses disabled symbols', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-settings-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        minFinalScore: 0,
        maxBarsPerSymbol: 500
      }
    });
    contexts.push(ctx);

    await relaxSignalSettings(ctx);

    const patch = await ctx.app.inject({
      method: 'PATCH',
      path: '/signals/config',
      payload: {
        enabledSymbols: ['ES'],
        enabledSetups: ['NY_BREAK_RETEST_MOMENTUM'],
        minFinalScore: 0
      }
    });

    expect(patch.statusCode).toBe(200);
    expect(patch.json().config.enabledSymbols).toEqual(['ES']);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    expect(ingest.statusCode).toBe(200);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });

    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json().alerts).toHaveLength(0);
  });

  it('creates a manual test alert on demand', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-test-alert-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        maxBarsPerSymbol: 500,
        escalationCheckIntervalMs: 25,
        escalationDelaysMs: [750]
      }
    });
    contexts.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: {
        symbol: 'ES'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ok).toBe(true);
    expect(response.json().alert.symbol).toBe('ES');

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });

    expect(alertsResponse.statusCode).toBe(200);
    expect(alertsResponse.json().alerts[0].title).toContain('test signal');
    expect(alertsResponse.json().alerts[0].symbol).toBe('ES');
    expect(alertsResponse.json().alerts[0].reviewState.escalationCount).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 820));

    const escalatedResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });

    expect(escalatedResponse.statusCode).toBe(200);
    expect(escalatedResponse.json().alerts[0].reviewState.escalationCount).toBeGreaterThanOrEqual(1);

    const ackResponse = await ctx.app.inject({
      method: 'POST',
      path: `/signals/alerts/${response.json().alert.alertId}/ack`,
      payload: {
        acknowledgedBy: 'tester'
      }
    });

    expect(ackResponse.statusCode).toBe(200);
    expect(ackResponse.json().review.acknowledgedBy).toBe('tester');
    expect(ackResponse.json().review.acknowledgedAt).toBeTruthy();

    const acknowledgedAlerts = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=10'
    });

    expect(acknowledgedAlerts.statusCode).toBe(200);
    expect(acknowledgedAlerts.json().alerts[0].reviewState.acknowledgedBy).toBe('tester');
  });

  it('auto-labels signal outcomes after future bars resolve the setup', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-auto-outcome-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor.json'),
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        outcomeLookaheadBars1m: 5,
        maxBarsPerSymbol: 500
      }
    });
    contexts.push(ctx);

    await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: {
        symbol: 'NQ'
      }
    });

    expect(response.statusCode).toBe(200);

    const alertsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=5'
    });
    const testAlert = alertsResponse.json().alerts.find((alert) => alert.alertId === response.json().alert.alertId);
    expect(testAlert).toBeTruthy();

    const startMs = Date.parse(testAlert.detectedAt) + 60_000;
    const tp = Number(testAlert.candidate.takeProfit[0]);
    const winBars = Array.from({ length: 5 }).map((_, index) => {
      const close = Number((testAlert.candidate.entry + 2 + index * 8).toFixed(2));
      return {
        symbol: 'NQ',
        timestamp: new Date(startMs + index * 60_000).toISOString(),
        open: Number((close - 1.5).toFixed(2)),
        high: index === 4 ? tp + 2 : close + 1.5,
        low: Number((testAlert.candidate.entry - 1).toFixed(2)),
        close,
        volume: 50 + index
      };
    });

    const ingestFollowThrough = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: winBars
      }
    });

    expect(ingestFollowThrough.statusCode).toBe(200);

    const reviewsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/signals/reviews?status=ALL&limit=20'
    });
    const labeled = reviewsResponse.json().reviews.find((review) => review.alertId === testAlert.alertId);

    expect(labeled.autoOutcome).toBe('WOULD_WIN');
    expect(labeled.effectiveOutcome).toBe('WOULD_WIN');
    expect(labeled.effectiveOutcomeSource).toBe('AUTO');
    expect(labeled.reviewStatus).toBe('COMPLETED');
  });

  it('self-completes older pending reviews from saved replay bars on startup', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-auto-backlog-'));
    tempDirs.push(tempDir);
    const signalMonitorSettingsStorePath = path.join(tempDir, 'signal-monitor.json');
    const signalReviewStorePath = path.join(tempDir, 'signal-reviews.json');
    const archivePath = path.join(tempDir, 'one-minute-bars.ndjson');

    const firstCtx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath,
      signalReviewStorePath,
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath: undefined,
        lookbackBars1m: 60,
        outcomeLookaheadBars1m: 5,
        maxBarsPerSymbol: 500
      }
    });
    contexts.push(firstCtx);

    await firstCtx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: buildMomentumBars()
      }
    });

    const testAlertResponse = await firstCtx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: {
        symbol: 'NQ'
      }
    });

    expect(testAlertResponse.statusCode).toBe(200);

    const alertsResponse = await firstCtx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=5'
    });
    const seededAlert = alertsResponse
      .json()
      .alerts.find((alert) => alert.alertId === testAlertResponse.json().alert.alertId);
    expect(seededAlert).toBeTruthy();
    if (!seededAlert) {
      throw new Error('Expected seeded alert to exist');
    }

    const startMs = Date.parse(seededAlert.detectedAt) + 60_000;
    const tp = Number(seededAlert.candidate.takeProfit[0]);
    const winBars = Array.from({ length: 5 }).map((_, index) => {
      const close = Number((seededAlert.candidate.entry + 2 + index * 8).toFixed(2));
      return {
        symbol: 'NQ',
        timestamp: new Date(startMs + index * 60_000).toISOString(),
        open: Number((close - 1.5).toFixed(2)),
        high: index === 4 ? tp + 2 : close + 1.5,
        low: Number((seededAlert.candidate.entry - 1).toFixed(2)),
        close,
        volume: 75 + index
      };
    });

    const archiveBars = [...buildMomentumBars(), ...winBars];
    await fs.writeFile(
      archivePath,
      `${archiveBars.map((bar) => JSON.stringify(bar)).join('\n')}\n`,
      'utf8'
    );

    await firstCtx.app.close();
    const firstCtxIndex = contexts.indexOf(firstCtx);
    if (firstCtxIndex >= 0) {
      contexts.splice(firstCtxIndex, 1);
    }

    const secondCtx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalMonitorSettingsStorePath,
      signalReviewStorePath,
      signalMonitorConfig: {
        bootstrapCsvDir: undefined,
        archivePath,
        lookbackBars1m: 60,
        outcomeLookaheadBars1m: 5,
        maxBarsPerSymbol: 500
      }
    });
    contexts.push(secondCtx);

    let resolvedReview: {
      autoOutcome?: string;
      effectiveOutcome?: string;
      effectiveOutcomeSource?: string;
      reviewStatus?: string;
    } | undefined;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reviewsResponse = await secondCtx.app.inject({
        method: 'GET',
        path: '/signals/reviews?status=ALL&limit=20'
      });
      resolvedReview = reviewsResponse
        .json()
        .reviews.find((review) => review.alertId === seededAlert.alertId);

      if (resolvedReview?.reviewStatus === 'COMPLETED' && resolvedReview.autoOutcome === 'WOULD_WIN') {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(resolvedReview?.autoOutcome).toBe('WOULD_WIN');
    expect(resolvedReview?.effectiveOutcome).toBe('WOULD_WIN');
    expect(resolvedReview?.effectiveOutcomeSource).toBe('AUTO');
    expect(resolvedReview?.reviewStatus).toBe('COMPLETED');
  });
});
