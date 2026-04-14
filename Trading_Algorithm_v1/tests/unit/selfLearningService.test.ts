import { describe, expect, it } from 'vitest';
import type { SetupCandidate } from '../../src/domain/types.js';
import type { TradeLearningRecord } from '../../src/stores/tradeLearningStore.js';
import { SelfLearningService } from '../../src/services/selfLearningService.js';

const buildRecord = (
  index: number,
  overrides: Partial<TradeLearningRecord> = {}
): TradeLearningRecord => {
  const detectedAt = new Date(Date.UTC(2026, 3, 1, 14, index, 0)).toISOString();
  return {
    recordId: `record-${index}`,
    alertId: `alert-${index}`,
    candidateId: `candidate-${index}`,
    symbol: 'NQ',
    setupType: 'NY_BREAK_RETEST_MOMENTUM',
    side: 'LONG',
    source: 'signal-monitor',
    detectedAt,
    createdAt: detectedAt,
    updatedAt: detectedAt,
    alertSnapshot: undefined,
    review: {
      reviewStatus: 'COMPLETED',
      outcome: 'WOULD_WIN',
      effectiveOutcome: 'WOULD_WIN',
      effectiveOutcomeSource: 'MANUAL',
      notes: 'Clean continuation.'
    },
    paperTrade: {
      paperTradeId: `paper-${index}`,
      status: 'CLOSED',
      source: 'paper-autonomy',
      submittedAt: detectedAt,
      expiresAt: detectedAt,
      filledAt: detectedAt,
      filledPrice: 20000,
      closedAt: detectedAt,
      exitPrice: 20010,
      exitReason: 'TAKE_PROFIT',
      realizedPnl: 150,
      realizedR: 1.5,
      quantity: 1,
      riskPct: 0.25,
      riskAmount: 100
    },
    research: {
      direction: 'BULLISH',
      confidence: 0.72,
      aligned: true,
      leadSymbol: 'NQ',
      summary: 'Bullish research alignment.'
    },
    autonomy: {
      thesis: 'TREND_BREAKOUT_EXPANSION',
      reason: 'Breakout continuation held.'
    },
    reasoning: {
      alertSummary: 'NQ long breakout retest.',
      reviewNotes: 'Clean continuation.',
      passReasons: ['held retest', 'momentum confirmed'],
      failReasons: [],
      guardrailCodes: [],
      why: ['held retest', 'momentum confirmed']
    },
    ...overrides
  };
};

const buildCandidate = (): SetupCandidate => ({
  id: 'candidate-live',
  setupType: 'NY_BREAK_RETEST_MOMENTUM',
  symbol: 'NQ',
  session: 'NY',
  detectionTimeframe: '5m',
  executionTimeframe: '5m',
  side: 'LONG',
  entry: 20000,
  stopLoss: 19992,
  takeProfit: [20016],
  baseScore: 76,
  oneMinuteConfidence: 0.7,
  finalScore: 76,
  eligibility: {
    passed: true,
    passReasons: ['held retest'],
    failReasons: []
  },
  metadata: {
    researchTrendDirection: 'BULLISH'
  },
  generatedAt: new Date().toISOString()
});

describe('self learning service', () => {
  it('stays neutral until enough resolved records exist', async () => {
    const service = new SelfLearningService({
      enabled: true,
      refreshIntervalMs: 60_000,
      minResolvedRecords: 8,
      minBucketSamples: 3,
      recentWindowDays: 30,
      maxReasonBuckets: 6,
      recordsProvider: async () => [buildRecord(1), buildRecord(2)]
    });

    await service.start();
    const signalAdjustment = service.scoreSignalCandidate(buildCandidate());
    expect(signalAdjustment.scoreAdjustment).toBe(0);
    expect(signalAdjustment.summary).toContain('gathering enough resolved trades');
    service.stop();
  });

  it('learns positive and negative edges from resolved trade history', async () => {
    const records: TradeLearningRecord[] = [
      buildRecord(1),
      buildRecord(2),
      buildRecord(3),
      buildRecord(4),
      buildRecord(5),
      buildRecord(6, {
        review: {
          reviewStatus: 'COMPLETED',
          outcome: 'WOULD_LOSE',
          effectiveOutcome: 'WOULD_LOSE',
          effectiveOutcomeSource: 'MANUAL',
          notes: 'Failed after entry.'
        },
        paperTrade: {
          paperTradeId: 'paper-6',
          status: 'CLOSED',
          source: 'paper-autonomy',
          submittedAt: new Date(Date.UTC(2026, 3, 1, 14, 6, 0)).toISOString(),
          expiresAt: new Date(Date.UTC(2026, 3, 1, 14, 6, 0)).toISOString(),
          filledAt: new Date(Date.UTC(2026, 3, 1, 14, 6, 0)).toISOString(),
          filledPrice: 20000,
          closedAt: new Date(Date.UTC(2026, 3, 1, 14, 10, 0)).toISOString(),
          exitPrice: 19992,
          exitReason: 'STOP_LOSS',
          realizedPnl: -100,
          realizedR: -1,
          quantity: 1,
          riskPct: 0.25,
          riskAmount: 100
        },
        reasoning: {
          alertSummary: 'NQ long breakout retest.',
          reviewNotes: 'Failed after entry.',
          passReasons: [],
          failReasons: ['failed after entry'],
          guardrailCodes: [],
          why: ['failed after entry']
        }
      })
    ];

    const service = new SelfLearningService({
      enabled: true,
      refreshIntervalMs: 60_000,
      minResolvedRecords: 4,
      minBucketSamples: 3,
      recentWindowDays: 30,
      maxReasonBuckets: 6,
      recordsProvider: async () => records
    });

    await service.start();
    const status = service.status();
    expect(status.started).toBe(true);
    expect(status.profile.resolvedRecords).toBe(6);
    expect(status.profile.overallWinRate).toBeGreaterThan(0);
    expect(status.profile.recentWinRate).toBeGreaterThan(0);
    expect(status.profile.activePositiveEdges).toBeGreaterThan(0);
    expect(status.profile.bySetupSymbol[0]?.key).toBe('NY_BREAK_RETEST_MOMENTUM|NQ');
    expect(status.profile.topWinReasons.map((entry) => entry.key)).toContain('held retest');

    const signalAdjustment = service.scoreSignalCandidate(buildCandidate());
    expect(signalAdjustment.scoreAdjustment).toBeGreaterThan(0);
    expect(signalAdjustment.summary).toContain('setup+symbol');

    const autonomyAdjustment = service.scoreAutonomyIdea({
      thesis: 'TREND_BREAKOUT_EXPANSION',
      symbol: 'NQ',
      side: 'LONG',
      researchDirection: 'BULLISH'
    });
    expect(autonomyAdjustment.scoreAdjustment).toBe(0);
    expect(autonomyAdjustment.summary).toContain('gathering enough resolved trades');
    service.stop();
  });

  it('separates manual-engine learning from autonomy learning', async () => {
    const manualWins = Array.from({ length: 5 }, (_, index) => buildRecord(index + 20));
    const autonomyLosses = Array.from({ length: 5 }, (_, index) =>
      buildRecord(index + 40, {
        source: 'paper-autonomy',
        alertSnapshot: {
          alertId: `autonomy-alert-${index}`,
          symbol: 'NQ',
          setupType: 'AUTONOMOUS_FUTURES_DAYTRADER',
          side: 'LONG',
          detectedAt: new Date(Date.UTC(2026, 3, 2, 14, index, 0)).toISOString(),
          rankingModelId: 'model-a',
          source: 'PAPER_AUTONOMY',
          title: 'Autonomy test alert',
          summary: 'Autonomy test alert',
          candidate: {
            ...buildCandidate(),
            id: `autonomy-candidate-${index}`,
            setupType: 'AUTONOMOUS_FUTURES_DAYTRADER'
          },
          riskDecision: {
            allowed: true,
            finalRiskPct: 0.5,
            positionSize: 1,
            reasonCodes: [],
            blockedByNewsWindow: false,
            blockedByTradingWindow: false,
            blockedByPolicy: false,
            checkedAt: new Date(Date.UTC(2026, 3, 2, 14, index, 0)).toISOString()
          }
        },
        review: {
          reviewStatus: 'COMPLETED',
          outcome: 'WOULD_LOSE',
          effectiveOutcome: 'WOULD_LOSE',
          effectiveOutcomeSource: 'MANUAL',
          notes: 'Autonomy thesis failed.'
        },
        paperTrade: {
          paperTradeId: `autonomy-paper-${index}`,
          status: 'CLOSED',
          source: 'paper-autonomy',
          submittedAt: new Date(Date.UTC(2026, 3, 2, 14, index, 0)).toISOString(),
          expiresAt: new Date(Date.UTC(2026, 3, 2, 14, index, 0)).toISOString(),
          filledAt: new Date(Date.UTC(2026, 3, 2, 14, index, 0)).toISOString(),
          filledPrice: 20000,
          closedAt: new Date(Date.UTC(2026, 3, 2, 14, index + 3, 0)).toISOString(),
          exitPrice: 19992,
          exitReason: 'STOP_LOSS',
          realizedPnl: -100,
          realizedR: -1,
          quantity: 1,
          riskPct: 0.25,
          riskAmount: 100
        },
        autonomy: {
          thesis: 'TREND_BREAKOUT_EXPANSION',
          reason: 'Autonomy thesis failed.'
        },
        reasoning: {
          alertSummary: 'Autonomy thesis failed.',
          reviewNotes: 'Autonomy thesis failed.',
          passReasons: [],
          failReasons: ['autonomy thesis failed'],
          guardrailCodes: [],
          why: ['autonomy thesis failed']
        }
      })
    );

    const service = new SelfLearningService({
      enabled: true,
      refreshIntervalMs: 60_000,
      minResolvedRecords: 4,
      minBucketSamples: 3,
      recentWindowDays: 30,
      maxReasonBuckets: 6,
      recordsProvider: async () => [...manualWins, ...autonomyLosses]
    });

    await service.start();

    const signalAdjustment = service.scoreSignalCandidate(buildCandidate());
    expect(signalAdjustment.scoreAdjustment).toBeGreaterThan(0);

    const autonomyAdjustment = service.scoreAutonomyIdea({
      thesis: 'TREND_BREAKOUT_EXPANSION',
      symbol: 'NQ',
      side: 'LONG',
      researchDirection: 'BULLISH'
    });
    expect(autonomyAdjustment.scoreAdjustment).toBeLessThan(0);
    expect(service.status().signalProfile.resolvedRecords).toBe(5);
    expect(service.status().autonomyProfile.resolvedRecords).toBe(5);
    service.stop();
  });
});
