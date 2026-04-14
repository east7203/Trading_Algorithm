import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';
import type { SignalAlert } from '../../src/domain/types.js';

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

const withApp = (
  signalReviewStorePath: string,
  signalMonitorSettingsStorePath: string,
  tradeLearningStorePath: string
): AppContext => {
  const ctx = buildApp({
    signalReviewStorePath,
    signalMonitorSettingsStorePath,
    tradeLearningStorePath,
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

const withReplayLearningApp = (tempDir: string): AppContext => {
    const ctx = buildApp({
      signalReviewStorePath: path.join(tempDir, 'signal-reviews.json'),
      signalMonitorSettingsStorePath: path.join(tempDir, 'signal-monitor-settings.json'),
      tradeLearningStorePath: path.join(tempDir, 'trade-learning.json'),
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
    marketResearchEnabled: true,
    marketResearchConfig: {
      archivePath: undefined,
      bootstrapCsvDir: undefined,
      statePath: path.join(tempDir, 'market-research-state.json'),
      maxBarsPerSymbol: 200
    },
    paperTradingEnabled: true,
    paperTradingConfig: {
      statePath: path.join(tempDir, 'paper-account.json')
    },
    paperAutonomyEnabled: true,
    paperAutonomyConfig: {
      archivePath: undefined,
      bootstrapCsvDir: undefined,
      statePath: path.join(tempDir, 'paper-autonomy-state.json'),
      maxBarsPerSymbol: 200
    }
  });
  contexts.push(ctx);
  return ctx;
};

const buildReplayLearningAlert = (): SignalAlert => ({
  alertId: 'replay-autonomy-learning-alert',
  symbol: 'NQ',
  setupType: 'AUTONOMOUS_FUTURES_DAYTRADER',
  side: 'LONG',
  detectedAt: '2026-01-06T14:35:00.000Z',
  rankingModelId: 'ranking-model-test',
  title: 'NQ autonomous replay test',
  summary: 'Autonomous breakout aligned with research trend.',
  candidate: {
    id: 'candidate-replay-autonomy-learning',
    setupType: 'AUTONOMOUS_FUTURES_DAYTRADER',
    symbol: 'NQ',
    session: 'NY',
    detectionTimeframe: '5m',
    executionTimeframe: '5m',
    side: 'LONG',
    entry: 100,
    stopLoss: 99,
    takeProfit: [102],
    baseScore: 88,
    oneMinuteConfidence: 0.67,
    finalScore: 91,
    eligibility: {
      passed: true,
      passReasons: ['REPLAY_TEST'],
      failReasons: []
    },
    metadata: {
      autonomyThesis: 'TREND_BREAKOUT_EXPANSION',
      autonomyReason: 'Momentum expansion out of replay review',
      researchDirection: 'BULLISH',
      researchConfidence: 0.74,
      researchTrendDirection: 'BULLISH',
      researchTrendConfidence: 0.74,
      researchTrendLeadSymbol: 'NQ',
      researchTrendAligned: true,
      researchTrendSummary: 'NQ and ES remained aligned bullish through the replay window.'
    },
    generatedAt: '2026-01-06T14:35:00.000Z'
  },
  riskDecision: {
    allowed: true,
    finalRiskPct: 0.25,
    positionSize: 1,
    reasonCodes: ['REPLAY_TEST'],
    blockedByNewsWindow: false,
    blockedByTradingWindow: false,
    blockedByPolicy: false,
    checkedAt: '2026-01-06T14:35:00.000Z'
  }
});

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

    const tradeLearningPath = path.join(tempDir, 'trade-learning.json');

    const ctx = withApp(storePath, settingsPath, tradeLearningPath);
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
      path: '/signals/learning?status=PENDING&limit=10'
    });
    expect(pendingResponse.statusCode).toBe(200);
    expect(pendingResponse.json().learningSummary.awaitingOutcome).toBeGreaterThan(0);

    const review = pendingResponse.json().cases[0];
    expect(review.alertSnapshot.symbol).toBe('NQ');

    const saveResponse = await ctx.app.inject({
      method: 'POST',
      path: '/signals/learning',
      payload: {
        alertId: review.alertId,
        validity: 'VALID',
        outcome: 'WOULD_WIN',
        notes: 'Held the break and clean continuation.',
        reviewedBy: 'qa-reviewer'
      }
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().caseEntry.reviewStatus).toBe('COMPLETED');
    expect(saveResponse.json().caseEntry.outcome).toBe('WOULD_WIN');
    expect(saveResponse.json().learningSummary.learned).toBeGreaterThan(0);
    expect(saveResponse.json().tradeLearning.reasoning.reviewNotes).toBe('Held the break and clean continuation.');

    const diagnostics = await ctx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json().diagnostics.reviews.completed).toBeGreaterThan(0);
    expect(diagnostics.json().diagnostics.tradeLearning.resolvedRecords).toBeGreaterThan(0);
    expect(diagnostics.json().diagnostics.lastAlert.symbol).toBe('NQ');
    expect(diagnostics.json().diagnostics.learningPerformance.resolvedReviews).toBeGreaterThan(0);

    const learning = await ctx.app.inject({
      method: 'GET',
      path: '/learning/performance'
    });
    expect(learning.statusCode).toBe(200);
    expect(learning.json().performance.bySetup.length).toBeGreaterThan(0);
    expect(learning.json().feedback.manualResolvedReviews).toBeGreaterThan(0);
    expect(learning.json().database.withReviewNotes).toBeGreaterThan(0);
    expect(learning.json().selfLearning.enabled).toBe(true);

    const tradeLearning = await ctx.app.inject({
      method: 'GET',
      path: '/trade-learning/records?status=RESOLVED&limit=10'
    });
    expect(tradeLearning.statusCode).toBe(200);
    const savedTradeRecord = tradeLearning.json().records.find((record) => record.alertId === review.alertId);
    expect(savedTradeRecord?.reasoning.reviewNotes).toBe('Held the break and clean continuation.');

    const selfLearning = await ctx.app.inject({
      method: 'GET',
      path: '/trade-learning/profile'
    });
    expect(selfLearning.statusCode).toBe(200);
    expect(selfLearning.json().selfLearning.enabled).toBe(true);
    expect(selfLearning.json().selfLearning.started).toBe(true);
    expect(selfLearning.json().selfLearning.profile.resolvedRecords).toBeGreaterThan(0);
    expect(selfLearning.json().selfLearning.profile.overallWinRate).toBeGreaterThan(0);
    expect(selfLearning.json().selfLearning.profile.recentResolvedRecords).toBeGreaterThan(0);

    const journal = await ctx.app.inject({
      method: 'GET',
      path: '/journal/trades'
    });
    expect(journal.statusCode).toBe(200);
    expect(journal.json().events.some((event) => event.type === 'SIGNAL_REVIEWED')).toBe(true);

    await ctx.app.close();
    contexts.pop();

    const reopened = withApp(storePath, settingsPath, tradeLearningPath);
    const completedResponse = await reopened.app.inject({
      method: 'GET',
      path: '/signals/learning?status=COMPLETED&limit=10'
    });

    expect(completedResponse.statusCode).toBe(200);
    expect(completedResponse.json().cases[0].outcome).toBe('WOULD_WIN');
    expect(completedResponse.json().cases[0].reviewedBy).toBe('qa-reviewer');

    const tradeLearningSummary = await reopened.app.inject({
      method: 'GET',
      path: '/trade-learning/summary'
    });
    expect(tradeLearningSummary.statusCode).toBe(200);
    expect(tradeLearningSummary.json().summary.wins).toBeGreaterThan(0);
  });

  it('feeds replay reviews into paper autonomy and market research', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-review-replay-learning-'));
    tempDirs.push(tempDir);

    const ctx = withReplayLearningApp(tempDir);
    await ctx.signalReviewStore.recordAlert(buildReplayLearningAlert());

    const saveResponse = await ctx.app.inject({
      method: 'POST',
      path: '/signals/learning',
      payload: {
        alertId: 'replay-autonomy-learning-alert',
        validity: 'VALID',
        outcome: 'WOULD_WIN',
        notes: 'Replay confirms the aligned breakout thesis.',
        reviewedBy: 'qa-reviewer'
      }
    });

    expect(saveResponse.statusCode).toBe(200);
    expect(saveResponse.json().learning.paperAutonomy?.thesis).toBe('TREND_BREAKOUT_EXPANSION');
    expect(saveResponse.json().learning.marketResearch?.thesis).toBe('ALIGNED_CONTINUATION');
    expect(saveResponse.json().tradeLearning.autonomy.thesis).toBe('TREND_BREAKOUT_EXPANSION');
    expect(saveResponse.json().tradeLearning.research.direction).toBe('BULLISH');

    const paperAutonomyStatus = ctx.paperAutonomyService?.status();
    expect(paperAutonomyStatus?.closedIdeas).toBeGreaterThan(0);
    expect(paperAutonomyStatus?.bestThesis?.thesis).toBe('TREND_BREAKOUT_EXPANSION');

    const researchStatus = ctx.marketResearchService?.status();
    expect(researchStatus?.performance.evaluatedPredictions).toBeGreaterThan(0);
    expect(researchStatus?.knowledgeBase.bestThesis?.thesis).toBe('ALIGNED_CONTINUATION');

    const tradeLearningSummary = await ctx.app.inject({
      method: 'GET',
      path: '/trade-learning/summary'
    });
    expect(tradeLearningSummary.statusCode).toBe(200);
    expect(tradeLearningSummary.json().summary.byAutonomyThesis[0].key).toBe('TREND_BREAKOUT_EXPANSION');
    expect(tradeLearningSummary.json().summary.byResearchDirection[0].key).toBe('BULLISH');
  });

  it('keeps manual-engine learning metrics isolated from autonomy replay reviews', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'signal-review-manual-learning-only-'));
    tempDirs.push(tempDir);
    const storePath = path.join(tempDir, 'signal-reviews.json');
    const settingsPath = path.join(tempDir, 'signal-monitor-settings.json');
    const tradeLearningPath = path.join(tempDir, 'trade-learning.json');

    const ctx = withApp(storePath, settingsPath, tradeLearningPath);
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
      path: '/signals/learning?status=PENDING&limit=10'
    });
    const manualReview = pendingResponse.json().cases[0];

    const manualSave = await ctx.app.inject({
      method: 'POST',
      path: '/signals/learning',
      payload: {
        alertId: manualReview.alertId,
        validity: 'VALID',
        outcome: 'WOULD_WIN',
        notes: 'Manual breakout worked.',
        reviewedBy: 'qa-reviewer'
      }
    });
    expect(manualSave.statusCode).toBe(200);

    await ctx.signalReviewStore.recordAlert(buildReplayLearningAlert());
    const autonomySave = await ctx.app.inject({
      method: 'POST',
      path: '/signals/learning',
      payload: {
        alertId: 'replay-autonomy-learning-alert',
        validity: 'VALID',
        outcome: 'WOULD_LOSE',
        notes: 'Autonomy replay failed.',
        reviewedBy: 'qa-reviewer'
      }
    });
    expect(autonomySave.statusCode).toBe(200);

    const performance = await ctx.app.inject({
      method: 'GET',
      path: '/learning/performance'
    });
    expect(performance.statusCode).toBe(200);
    expect(performance.json().performance.resolvedReviews).toBe(1);
    expect(performance.json().feedback.manualResolvedReviews).toBe(1);
    expect(performance.json().performance.bySetup[0].key).toBe('NY_BREAK_RETEST_MOMENTUM');

    const selfLearning = await ctx.app.inject({
      method: 'GET',
      path: '/trade-learning/profile'
    });
    expect(selfLearning.statusCode).toBe(200);
    expect(selfLearning.json().selfLearning.signalProfile.resolvedRecords).toBe(1);
    expect(selfLearning.json().selfLearning.autonomyProfile.resolvedRecords).toBeGreaterThanOrEqual(1);
  });
});
