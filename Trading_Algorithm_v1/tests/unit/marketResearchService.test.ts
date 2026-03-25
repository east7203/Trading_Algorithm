import { describe, expect, it } from 'vitest';
import { MarketResearchService } from '../../src/services/marketResearchService.js';
import type { OneMinuteBar } from '../../src/training/historicalTrainer.js';

const buildTrendBars = (
  symbol: 'NQ' | 'ES',
  direction: 'up' | 'down',
  startTimestamp: string,
  startPrice: number,
  step = 0.8
): OneMinuteBar[] => {
  const anchor = Date.parse(startTimestamp);
  return Array.from({ length: 240 }).map((_, index) => {
    const drift = direction === 'up' ? index * step : -index * step;
    const close = startPrice + drift;
    const open = close + (direction === 'up' ? -0.3 : 0.3);
    const high = Math.max(open, close) + 0.4;
    const low = Math.min(open, close) - 0.4;
    return {
      symbol,
      timestamp: new Date(anchor + index * 60_000).toISOString(),
      open,
      high,
      low,
      close,
      volume: 100 + index
    };
  });
};

describe('market research service', () => {
  it('builds a bullish autonomous trend when NQ and ES rise together', async () => {
    const service = new MarketResearchService({
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 1000,
      focusSymbols: ['NQ', 'ES']
    });

    await service.start();
    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'up', '2026-03-25T13:30:00.000Z', 5800)
    ]);

    const status = service.status();
    expect(status.overallTrend.direction).toBe('BULLISH');
    expect(status.overallTrend.aligned).toBe(true);
    expect(status.symbols).toHaveLength(2);
  });

  it('stands aside when NQ and ES diverge', async () => {
    const service = new MarketResearchService({
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 1000,
      focusSymbols: ['NQ', 'ES']
    });

    await service.start();
    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'down', '2026-03-25T13:30:00.000Z', 5800, 1.8)
    ]);

    const status = service.status();
    expect(status.overallTrend.direction).toBe('STAND_ASIDE');
    expect(status.overallTrend.aligned).toBe(false);
  });
});
