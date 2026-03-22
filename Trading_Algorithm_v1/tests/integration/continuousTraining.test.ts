import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';
import { ContinuousTrainingService } from '../../src/training/continuousTrainingService.js';
import { RankingModelStore } from '../../src/services/rankingModelStore.js';
import { defaultRankingModel } from '../../src/services/rankingModel.js';

const contexts: AppContext[] = [];
const tempDirs: string[] = [];

const waitFor = async (
  fn: () => Promise<boolean>,
  timeoutMs = 1_500,
  intervalMs = 25
): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
};

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }

  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe('continuous training integration', () => {
  it('ingests live bars and reports training status', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuous-training-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      continuousTrainingEnabled: true,
      continuousTrainingConfig: {
        bootstrapCsvDir: path.join(tempDir, 'historical'),
        bootstrapRecursive: true,
        liveArchivePath: path.join(tempDir, 'live-bars.ndjson'),
        modelOutputPath: path.join(tempDir, 'model.json'),
        minBarsToTrain: 10_000,
        minExamplesToTrain: 10_000,
        minNewBarsForRetrain: 500,
        retrainIntervalMs: 60_000,
        pollIntervalMs: 60_000
      }
    });
    contexts.push(ctx);

    const statusBefore = await ctx.app.inject({
      method: 'GET',
      path: '/training/status'
    });
    expect(statusBefore.statusCode).toBe(200);
    expect(statusBefore.json().training.enabled).toBe(true);

    const ingest = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      payload: {
        bars: [
          {
            symbol: 'NQ',
            timestamp: '2026-03-09T13:30:00.000Z',
            open: 18200,
            high: 18205,
            low: 18195,
            close: 18202,
            volume: 12
          },
          {
            symbol: 'NQ',
            timestamp: '2026-03-09T13:30:00.000Z',
            open: 18200,
            high: 18205,
            low: 18195,
            close: 18202,
            volume: 12
          },
          {
            symbol: 'NQ',
            timestamp: '2026-03-09T13:31:00.000Z',
            open: 18202,
            high: 18208,
            low: 18200,
            close: 18206,
            volume: 9
          }
        ]
      }
    });

    expect(ingest.statusCode).toBe(200);
    expect(ingest.json().ingest.accepted).toBe(2);
    expect(ingest.json().ingest.deduped).toBe(0);
    expect(ingest.json().training.barCount).toBe(2);

    const retrain = await ctx.app.inject({
      method: 'POST',
      path: '/training/retrain'
    });
    expect(retrain.statusCode).toBe(200);
    expect(retrain.json().run.executed).toBe(false);
  });

  it('only bootstraps one-minute historical files', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuous-training-bootstrap-'));
    tempDirs.push(tempDir);

    const historicalDir = path.join(tempDir, 'historical');
    await fs.mkdir(historicalDir, { recursive: true });
    await fs.writeFile(
      path.join(historicalDir, 'polygon_QQQ_1minute_2026-01-01_2026-01-02.csv'),
      'timestamp,open,high,low,close,volume,symbol\n2026-01-02T14:30:00.000Z,1,2,0.5,1.5,10,NQ\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(historicalDir, 'polygon_QQQ_1day_2026-01-01_2026-01-02.csv'),
      'timestamp,open,high,low,close,volume,symbol\n2026-01-02T00:00:00.000Z,1,2,0.5,1.5,10,NQ\n',
      'utf8'
    );

    const ctx = buildApp({
      continuousTrainingEnabled: true,
      continuousTrainingConfig: {
        bootstrapCsvDir: historicalDir,
        bootstrapRecursive: true,
        liveArchivePath: path.join(tempDir, 'live-bars.ndjson'),
        modelOutputPath: path.join(tempDir, 'model.json'),
        minBarsToTrain: 10_000,
        minExamplesToTrain: 10_000,
        minNewBarsForRetrain: 500,
        retrainIntervalMs: 60_000,
        pollIntervalMs: 60_000
      }
    });
    contexts.push(ctx);

    const status = await ctx.app.inject({
      method: 'GET',
      path: '/training/status'
    });

    await waitFor(async () => {
      const poll = await ctx.app.inject({
        method: 'GET',
        path: '/training/status'
      });
      return poll.json().training.data.bootstrapCsvFiles === 1;
    });

    await waitFor(async () => {
      const poll = await ctx.app.inject({
        method: 'GET',
        path: '/training/status'
      });
      return Boolean(poll.json().training.cadence.nextWindowAt);
    });

    const settledStatus = await ctx.app.inject({
      method: 'GET',
      path: '/training/status'
    });

    expect(status.statusCode).toBe(200);
    expect(settledStatus.json().training.data.bootstrapCsvFiles).toBe(1);
    expect(settledStatus.json().training.data.bootstrapTimeframe).toBe('1m');
    expect(settledStatus.json().training.data.analysisTimeframes).toEqual([
      '1m',
      '5m',
      '15m',
      '1H',
      '4H',
      'D1',
      'W1'
    ]);
    expect(settledStatus.json().training.cadence.retrainIntervalMinutes).toBe(1);
    expect(settledStatus.json().training.cadence.minNewBarsForRetrain).toBe(500);
    expect(settledStatus.json().training.cadence.nextWindowAt).toBeTruthy();
    expect(settledStatus.json().training.barCount).toBe(1);
  });

  it('only promotes a challenger when validation beats the active model', async () => {
    const makeCandidate = (id: string, setupType: 'NY_BREAK_RETEST_MOMENTUM' | 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES' | 'WERLEIN_FOREVER_MODEL') => ({
      id,
      setupType,
      symbol: 'NQ' as const,
      session: 'NY' as const,
      detectionTimeframe: '5m' as const,
      executionTimeframe: '5m' as const,
      side: 'LONG' as const,
      entry: 100,
      stopLoss: 95,
      takeProfit: [108],
      baseScore: 80,
      oneMinuteConfidence: 0.5,
      finalScore: 80,
      eligibility: {
        passed: true,
        passReasons: ['test'],
        failReasons: []
      },
      metadata: {},
      generatedAt: '2026-03-12T14:30:00.000Z'
    });

    const feedbackExamples = Array.from({ length: 12 }).flatMap((_, index) => [
      {
        snapshotId: `snapshot-${index}`,
        candidate: makeCandidate(`loss-${index}`, 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES'),
        outcome: 'LOSS' as const
      },
      {
        snapshotId: `snapshot-${index}`,
        candidate: makeCandidate(`win-${index}`, 'NY_BREAK_RETEST_MOMENTUM'),
        outcome: 'WIN' as const
      }
    ]);

    const modelStore = new RankingModelStore(defaultRankingModel());
    const service = new ContinuousTrainingService(modelStore, {
      enabled: true,
      retrainIntervalMs: 60_000,
      minBarsToTrain: 10,
      minExamplesToTrain: 4,
      minNewBarsForRetrain: 500,
      maxBarsRetained: 1000,
      validationPct: 25,
      pollIntervalMs: 60_000,
      promotionMinDelta: 0,
      minEvaluationTopPicks: 1,
      feedbackDatasetProvider: async () => ({
        examples: feedbackExamples,
        counts: {
          totalExamples: feedbackExamples.length,
          marketExamples: feedbackExamples.length,
          preferenceExamples: 0,
          manualOutcomeExamples: feedbackExamples.length,
          autoOutcomeExamples: 0,
          manualPreferenceExamples: 0,
          resolvedReviews: 12,
          manualResolvedReviews: 12,
          autoResolvedReviews: 0,
          pendingOutcomeReviews: 0
        }
      })
    });

    await service.ingestBars(
      Array.from({ length: 10 }).map((_, index) => ({
        symbol: 'NQ' as const,
        timestamp: new Date(Date.parse('2026-03-12T14:00:00.000Z') + index * 60_000).toISOString(),
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 10
      }))
    );

    const run = await service.forceRetrain();
    const status = service.status();

    expect(run.executed).toBe(true);
    expect(run.promoted).toBe(true);
    expect(run.promotionDelta).toBeGreaterThan(0.01);
    expect(status.promotion.promotions).toBe(1);
    expect(status.feedback.totalExamples).toBe(feedbackExamples.length);
    expect(status.model.modelId).not.toBe('default-rule-model');
  });

  it('persists training history and reports active-model improvement trends', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'continuous-training-history-'));
    tempDirs.push(tempDir);

    const historyOutputPath = path.join(tempDir, 'training-history.json');
    const liveArchivePath = path.join(tempDir, 'live-bars.ndjson');

    const makeCandidate = (
      id: string,
      setupType: 'NY_BREAK_RETEST_MOMENTUM' | 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES' | 'WERLEIN_FOREVER_MODEL'
    ) => ({
      id,
      setupType,
      symbol: 'NQ' as const,
      session: 'NY' as const,
      detectionTimeframe: '5m' as const,
      executionTimeframe: '5m' as const,
      side: 'LONG' as const,
      entry: 100,
      stopLoss: 95,
      takeProfit: [108],
      baseScore: 80,
      oneMinuteConfidence: 0.5,
      finalScore: 80,
      eligibility: {
        passed: true,
        passReasons: ['test'],
        failReasons: []
      },
      metadata: {},
      generatedAt: '2026-03-12T14:30:00.000Z'
    });

    const feedbackExamples = Array.from({ length: 12 }).flatMap((_, index) => [
      {
        snapshotId: `loss-${index}`,
        candidate: makeCandidate(`loss-${index}`, 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES'),
        outcome: 'LOSS' as const
      },
      {
        snapshotId: `win-${index}`,
        candidate: makeCandidate(`win-${index}`, 'NY_BREAK_RETEST_MOMENTUM'),
        outcome: 'WIN' as const
      }
    ]);

    const config = {
      enabled: true,
      retrainIntervalMs: 60_000,
      minBarsToTrain: 10,
      minExamplesToTrain: 4,
      minNewBarsForRetrain: 500,
      maxBarsRetained: 1000,
      validationPct: 25,
      pollIntervalMs: 60_000,
      promotionMinDelta: 0.01,
      minEvaluationTopPicks: 1,
      liveArchivePath,
      historyOutputPath,
      historyLimit: 10,
      feedbackDatasetProvider: async () => ({
        examples: feedbackExamples,
        counts: {
          totalExamples: feedbackExamples.length,
          marketExamples: feedbackExamples.length,
          preferenceExamples: 0,
          manualOutcomeExamples: feedbackExamples.length,
          autoOutcomeExamples: 0,
          manualPreferenceExamples: 0,
          resolvedReviews: feedbackExamples.length / 2,
          manualResolvedReviews: feedbackExamples.length / 2,
          autoResolvedReviews: 0,
          pendingOutcomeReviews: 0
        }
      })
    };

    const service = new ContinuousTrainingService(new RankingModelStore(defaultRankingModel()), config);

    await service.ingestBars(
      Array.from({ length: 10 }).map((_, index) => ({
        symbol: 'NQ' as const,
        timestamp: new Date(Date.parse('2026-03-12T14:00:00.000Z') + index * 60_000).toISOString(),
        open: 100,
        high: 101,
        low: 99,
        close: 100,
        volume: 10
      }))
    );

    const firstRun = await service.forceRetrain();
    const firstStatus = service.status();
    const persistedHistory = JSON.parse(await fs.readFile(historyOutputPath, 'utf8'));
    const firstRecordedAt = persistedHistory.history[0].recordedAt as string;

    expect(firstRun.executed).toBe(true);
    expect(firstStatus.history).toHaveLength(1);
    expect(firstStatus.progress.historyCount).toBe(1);
    expect(firstStatus.progress.bestValidationDelta).toBe(firstRun.validationDelta ?? 0);
    expect(firstStatus.progress.activeFullHistoryDelta).toBeGreaterThanOrEqual(0);
    expect(firstStatus.progress.activeEvaluationDelta).toBeGreaterThanOrEqual(0);

    const reloaded = new ContinuousTrainingService(new RankingModelStore(defaultRankingModel()), config);
    await reloaded.start();

    const reloadedStatus = reloaded.status();
    reloaded.stop();

    expect(reloadedStatus.history.some((entry) => entry.recordedAt === firstRecordedAt)).toBe(true);
    expect(reloadedStatus.progress.historyCount).toBeGreaterThanOrEqual(1);
    expect(reloadedStatus.progress.bestValidationDelta).toBeGreaterThanOrEqual(0);
  });
});
