import { describe, expect, it } from 'vitest';
import type { SetupCandidate, SetupType, SymbolCode } from '../../src/domain/types.js';
import { rankCandidates } from '../../src/services/ranker.js';
import { defaultRankingModel } from '../../src/services/rankingModel.js';
import {
  parseOneMinuteCsv,
  trainRankingModelFromExamples,
  type TrainingExample
} from '../../src/training/historicalTrainer.js';

const baseCandidate = (
  id: string,
  setupType: SetupType,
  symbol: SymbolCode,
  oneMinuteConfidence: number,
  metadata: Record<string, unknown> = {}
): SetupCandidate => ({
  id,
  setupType,
  symbol,
  session: 'NY',
  detectionTimeframe: '15m',
  executionTimeframe: '5m',
  side: 'LONG',
  entry: 100,
  stopLoss: 99,
  takeProfit: [101.5, 102.5],
  baseScore: 70,
  oneMinuteConfidence,
  eligibility: {
    passed: true,
    passReasons: ['rule-pass'],
    failReasons: []
  },
  metadata,
  generatedAt: '2026-03-09T15:00:00.000Z'
});

describe('historical trainer', () => {
  it('learns setup adjustments from historical outcomes', () => {
    const examples: TrainingExample[] = [];

    // High win-rate setup.
    for (let i = 0; i < 12; i += 1) {
      examples.push({
        snapshotId: `s-a-${i}`,
        candidate: baseCandidate(
          `a-${i}`,
          'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
          'NQ',
          0.75
        ),
        outcome: i < 9 ? 'WIN' : 'LOSS'
      });
    }

    // Lower win-rate setup.
    for (let i = 0; i < 12; i += 1) {
      examples.push({
        snapshotId: `s-b-${i}`,
        candidate: baseCandidate(`b-${i}`, 'NY_BREAK_RETEST_MOMENTUM', 'NQ', 0.35),
        outcome: i < 3 ? 'WIN' : 'LOSS'
      });
    }

    const model = trainRankingModelFromExamples(examples);
    expect(model.sampleCount).toBe(examples.length);
    expect(
      model.setupAdjustments.DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION
    ).toBeGreaterThan(model.setupAdjustments.NY_BREAK_RETEST_MOMENTUM);
  });

  it('trained model can alter top rank versus default model', () => {
    const examples: TrainingExample[] = [
      {
        snapshotId: 'snap-1',
        candidate: baseCandidate('winner', 'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION', 'NQ', 0.8),
        outcome: 'WIN'
      },
      {
        snapshotId: 'snap-2',
        candidate: baseCandidate('winner-2', 'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION', 'NQ', 0.78),
        outcome: 'WIN'
      },
      {
        snapshotId: 'snap-3',
        candidate: baseCandidate('loser', 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES', 'NQ', 0.2),
        outcome: 'LOSS'
      },
      {
        snapshotId: 'snap-4',
        candidate: baseCandidate('loser-2', 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES', 'NQ', 0.25),
        outcome: 'LOSS'
      }
    ];

    const trained = trainRankingModelFromExamples(examples);
    const candidateA = baseCandidate('A', 'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION', 'NQ', 0.76);
    const candidateB = baseCandidate('B', 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES', 'NQ', 0.76);

    const defaultRanked = rankCandidates({ candidates: [candidateA, candidateB] }, defaultRankingModel());
    const trainedRanked = rankCandidates({ candidates: [candidateA, candidateB] }, trained);

    expect(defaultRanked).toHaveLength(2);
    expect(trainedRanked).toHaveLength(2);
    expect(trainedRanked[0].id).toBe('A');
  });

  it('learns ai-context weight when higher-timeframe score is predictive', () => {
    const examples: TrainingExample[] = [];
    for (let i = 0; i < 20; i += 1) {
      examples.push({
        snapshotId: `snap-win-${i}`,
        candidate: baseCandidate(
          `win-${i}`,
          'NY_BREAK_RETEST_MOMENTUM',
          'NQ',
          0.5,
          { aiContextScore: 3 }
        ),
        outcome: 'WIN'
      });
      examples.push({
        snapshotId: `snap-loss-${i}`,
        candidate: baseCandidate(
          `loss-${i}`,
          'NY_BREAK_RETEST_MOMENTUM',
          'NQ',
          0.5,
          { aiContextScore: -3 }
        ),
        outcome: 'LOSS'
      });
    }

    const model = trainRankingModelFromExamples(examples);
    expect(model.aiContextWeight).toBeGreaterThan(defaultRankingModel().aiContextWeight);
  });

  it('parses Databento-style ts_event timestamp column', () => {
    const csv = [
      'ts_event,open,high,low,close,volume,symbol',
      '2026-03-09T13:30:00.000000000Z,18000,18005,17995,18002,12,NQ'
    ].join('\n');

    const parsed = parseOneMinuteCsv(csv);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].symbol).toBe('NQ');
    expect(parsed[0].timestamp).toBe('2026-03-09T13:30:00.000Z');
  });
});
