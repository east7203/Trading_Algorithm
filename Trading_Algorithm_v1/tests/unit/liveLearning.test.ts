import { describe, expect, it } from 'vitest';
import type { SignalReviewEntry } from '../../src/domain/types.js';
import {
  buildLearningFeedbackDataset,
  resolveEffectiveReviewOutcome,
  summarizeLearningPerformance
} from '../../src/training/liveLearning.js';

const buildReview = (
  overrides: Partial<SignalReviewEntry> = {},
  candidateOverrides: Record<string, unknown> = {}
): SignalReviewEntry => {
  const detectedAt = overrides.detectedAt ?? '2026-03-12T14:30:00.000Z';

  return {
    reviewId: overrides.reviewId ?? 'review-1',
    alertId: overrides.alertId ?? 'alert-1',
    candidateId: overrides.candidateId ?? 'candidate-1',
    symbol: overrides.symbol ?? 'NQ',
    setupType: overrides.setupType ?? 'NY_BREAK_RETEST_MOMENTUM',
    side: overrides.side ?? 'LONG',
    detectedAt,
    reviewStatus: overrides.reviewStatus ?? 'PENDING',
    validity: overrides.validity,
    outcome: overrides.outcome,
    notes: overrides.notes,
    acknowledgedAt: overrides.acknowledgedAt,
    acknowledgedBy: overrides.acknowledgedBy,
    escalationCount: overrides.escalationCount ?? 0,
    lastEscalatedAt: overrides.lastEscalatedAt,
    reviewedBy: overrides.reviewedBy,
    reviewedAt: overrides.reviewedAt,
    autoOutcome: overrides.autoOutcome,
    autoLabeledAt: overrides.autoLabeledAt,
    autoLabeledBy: overrides.autoLabeledBy,
    effectiveOutcome: overrides.effectiveOutcome,
    effectiveOutcomeSource: overrides.effectiveOutcomeSource,
    createdAt: overrides.createdAt ?? detectedAt,
    updatedAt: overrides.updatedAt ?? detectedAt,
    alertSnapshot: overrides.alertSnapshot ?? {
      alertId: overrides.alertId ?? 'alert-1',
      symbol: overrides.symbol ?? 'NQ',
      setupType: overrides.setupType ?? 'NY_BREAK_RETEST_MOMENTUM',
      side: overrides.side ?? 'LONG',
      detectedAt,
      rankingModelId: 'model-a',
      title: 'NQ LONG signal',
      summary: 'Test signal',
      candidate: {
        id: overrides.candidateId ?? 'candidate-1',
        setupType: overrides.setupType ?? 'NY_BREAK_RETEST_MOMENTUM',
        symbol: overrides.symbol ?? 'NQ',
        session: 'NY',
        detectionTimeframe: '5m',
        executionTimeframe: '5m',
        side: overrides.side ?? 'LONG',
        entry: 100,
        stopLoss: 95,
        takeProfit: [108],
        baseScore: 80,
        oneMinuteConfidence: 0.6,
        finalScore: 84,
        eligibility: {
          passed: true,
          passReasons: ['test'],
          failReasons: []
        },
        metadata: {},
        generatedAt: detectedAt,
        ...candidateOverrides
      },
      riskDecision: {
        allowed: true,
        finalRiskPct: 0.5,
        positionSize: 1,
        reasonCodes: [],
        blockedByNewsWindow: false,
        blockedByTradingWindow: false,
        blockedByPolicy: false,
        checkedAt: detectedAt
      },
      reviewState: {
        reviewStatus: overrides.reviewStatus ?? 'PENDING',
        escalationCount: 0
      }
    }
  };
};

describe('live learning helpers', () => {
  it('builds weighted feedback examples from manual and auto reviews', () => {
    const manualWin = buildReview({
      alertId: 'manual-win',
      reviewStatus: 'COMPLETED',
      validity: 'VALID',
      outcome: 'WOULD_WIN',
      reviewedBy: 'east'
    });
    const autoLoss = buildReview(
      {
        alertId: 'auto-loss',
        reviewId: 'review-2',
        candidateId: 'candidate-2',
        symbol: 'YM',
        setupType: 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
        autoOutcome: 'WOULD_LOSE',
        autoLabeledAt: '2026-03-12T15:00:00.000Z',
        validity: 'INVALID'
      },
      {
        symbol: 'YM',
        setupType: 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES'
      }
    );

    const dataset = buildLearningFeedbackDataset([manualWin, autoLoss]);

    expect(dataset.counts.manualResolvedReviews).toBe(1);
    expect(dataset.counts.autoResolvedReviews).toBe(1);
    expect(dataset.counts.manualOutcomeExamples).toBe(2);
    expect(dataset.counts.autoOutcomeExamples).toBe(1);
    expect(dataset.counts.preferenceExamples).toBe(2);
    expect(dataset.counts.totalExamples).toBe(5);
    expect(dataset.examples.filter((example) => example.outcome === 'WIN')).toHaveLength(3);
    expect(dataset.examples.filter((example) => example.outcome === 'LOSS')).toHaveLength(2);
  });

  it('summarizes effective performance and preferences', () => {
    const reviews = [
      buildReview({
        alertId: 'manual-win',
        reviewStatus: 'COMPLETED',
        validity: 'VALID',
        outcome: 'WOULD_WIN'
      }),
      buildReview(
        {
          alertId: 'auto-loss',
          reviewId: 'review-2',
          candidateId: 'candidate-2',
          symbol: 'YM',
          setupType: 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
          autoOutcome: 'WOULD_LOSE',
          autoLabeledAt: '2026-03-12T15:00:00.000Z',
          validity: 'INVALID'
        },
        {
          symbol: 'YM',
          setupType: 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES'
        }
      ),
      buildReview({
        alertId: 'pending',
        reviewId: 'review-3',
        candidateId: 'candidate-3',
        reviewStatus: 'PENDING'
      })
    ];

    const effectiveManual = resolveEffectiveReviewOutcome(reviews[0]);
    const effectiveAuto = resolveEffectiveReviewOutcome(reviews[1]);
    const summary = summarizeLearningPerformance(reviews);

    expect(effectiveManual.source).toBe('MANUAL');
    expect(effectiveAuto.source).toBe('AUTO');
    expect(summary.resolvedReviews).toBe(2);
    expect(summary.pendingOutcomeReviews).toBe(1);
    expect(summary.bySetup[0].key).toBe('NY_BREAK_RETEST_MOMENTUM');
    expect(summary.byExecutionTimeframe[0].key).toBe('5m');
    expect(summary.preference.preferredSetups).toContain('NY_BREAK_RETEST_MOMENTUM');
    expect(summary.blockedVsReady.readyResolved).toBe(2);
  });
});
