import { describe, expect, it } from 'vitest';
import { deriveResearchAiContext } from '../../src/services/signalMonitorService.js';
import type { MarketResearchStatus } from '../../src/services/marketResearchService.js';

const buildResearchStatus = (overrides: Partial<MarketResearchStatus['overallTrend']> = {}): MarketResearchStatus => ({
  enabled: true,
  started: true,
  lastComputedAt: '2026-03-25T14:00:00.000Z',
  latestBarTimestampBySymbol: {
    NQ: '2026-03-25T14:00:00.000Z',
    ES: '2026-03-25T14:00:00.000Z'
  },
  overallTrend: {
    direction: 'BULLISH',
    confidence: 0.72,
    score: 1.9,
    aligned: true,
    leadSymbol: 'NQ',
    reason: 'NQ and ES are aligned bullish. NQ is leading the move.',
    reasons: [],
    ...overrides
  },
  symbols: [
    {
      symbol: 'NQ',
      direction: 'BULLISH',
      confidence: 0.75,
      compositeScore: 2.1,
      latestPrice: 20100,
      latestBarTimestamp: '2026-03-25T14:00:00.000Z',
      frameScores: [],
      reason: 'NQ is trending higher.',
      reasons: []
    },
    {
      symbol: 'ES',
      direction: 'BULLISH',
      confidence: 0.68,
      compositeScore: 1.7,
      latestPrice: 5800,
      latestBarTimestamp: '2026-03-25T14:00:00.000Z',
      frameScores: [],
      reason: 'ES is trending higher.',
      reasons: []
    }
  ],
  data: {
    archivePath: undefined,
    bootstrapCsvDir: undefined,
    bootstrapRecursive: true,
    maxBarsPerSymbol: 6000,
    focusSymbols: ['NQ', 'ES'],
    analysisTimeframes: ['5m', '15m', '1H']
  }
});

describe('deriveResearchAiContext', () => {
  it('boosts setups aligned with the autonomous trend', () => {
    const context = deriveResearchAiContext(
      {
        symbol: 'NQ',
        side: 'LONG'
      },
      buildResearchStatus()
    );

    expect(context.direction).toBe('BULLISH');
    expect(context.aligned).toBe(true);
    expect(context.scoreAdjustment).toBeGreaterThan(0);
  });

  it('penalizes setups that fight the autonomous trend', () => {
    const context = deriveResearchAiContext(
      {
        symbol: 'NQ',
        side: 'SHORT'
      },
      buildResearchStatus()
    );

    expect(context.direction).toBe('BULLISH');
    expect(context.aligned).toBe(false);
    expect(context.scoreAdjustment).toBeLessThan(0);
  });

  it('penalizes all setups when the research model says stand aside', () => {
    const context = deriveResearchAiContext(
      {
        symbol: 'ES',
        side: 'LONG'
      },
      buildResearchStatus({
        direction: 'STAND_ASIDE',
        confidence: 0.81,
        aligned: false,
        reason: 'NQ and ES are diverging.'
      })
    );

    expect(context.direction).toBe('STAND_ASIDE');
    expect(context.scoreAdjustment).toBeLessThan(0);
  });
});
