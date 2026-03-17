import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../../src/services/ranker.js';
import type { SetupCandidate } from '../../src/domain/types.js';

const baseCandidate = (overrides: Partial<SetupCandidate>): SetupCandidate => ({
  id: 'candidate-1',
  setupType: 'NY_BREAK_RETEST_MOMENTUM',
  symbol: 'NAS100',
  session: 'NY',
  detectionTimeframe: '15m',
  executionTimeframe: '5m',
  side: 'LONG',
  entry: 100,
  stopLoss: 99,
  takeProfit: [101.5, 102.5],
  baseScore: 70,
  oneMinuteConfidence: 0.5,
  eligibility: {
    passed: true,
    passReasons: ['rule-pass'],
    failReasons: []
  },
  metadata: {},
  generatedAt: '2026-03-07T15:00:00.000Z',
  ...overrides
});

describe('rankCandidates', () => {
  it('uses 1m as soft score influence and not a hard gate', () => {
    const low1m = baseCandidate({ id: 'low-1m', oneMinuteConfidence: 0.1, baseScore: 71 });
    const high1m = baseCandidate({ id: 'high-1m', oneMinuteConfidence: 0.9, baseScore: 71 });

    const ranked = rankCandidates({ candidates: [low1m, high1m] });

    expect(ranked).toHaveLength(2);
    expect(ranked[0].id).toBe('high-1m');
    expect(ranked[1].id).toBe('low-1m');
    expect(ranked[1].finalScore).toBeDefined();
  });

  it('filters only deterministic-rule-ineligible candidates', () => {
    const eligible = baseCandidate({ id: 'eligible', oneMinuteConfidence: 0.2 });
    const ineligible = baseCandidate({
      id: 'ineligible',
      oneMinuteConfidence: 0.9,
      eligibility: {
        passed: false,
        passReasons: [],
        failReasons: ['rule-fail']
      }
    });

    const ranked = rankCandidates({ candidates: [ineligible, eligible] });

    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe('eligible');
  });
});
