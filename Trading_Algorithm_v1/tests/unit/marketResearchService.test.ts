import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

  it('notifies once when the autonomous trend flips into a directional state', async () => {
    const trendFlips: string[] = [];
    const service = new MarketResearchService({
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 240,
      focusSymbols: ['NQ', 'ES'],
      flipNotificationMinConfidence: 0.4,
      onTrendFlip: async (event) => {
        trendFlips.push(`${event.previousDirection}->${event.nextTrend.direction}`);
      }
    });

    await service.start();
    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'up', '2026-03-25T13:30:00.000Z', 5800)
    ]);

    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T17:30:00.000Z', 20600),
      ...buildTrendBars('ES', 'up', '2026-03-25T17:30:00.000Z', 5920)
    ]);

    await service.ingestBars([
      ...buildTrendBars('NQ', 'down', '2026-03-25T21:30:00.000Z', 20800, 1.4),
      ...buildTrendBars('ES', 'down', '2026-03-25T21:30:00.000Z', 5980, 0.9)
    ]);

    expect(trendFlips).toEqual(['STAND_ASIDE->BULLISH', 'BULLISH->BEARISH']);
  });

  it('tracks directional prediction performance over the evaluation window', async () => {
    const service = new MarketResearchService({
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 1000,
      focusSymbols: ['NQ', 'ES'],
      evaluationMinutes: 60
    });

    await service.start();
    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'up', '2026-03-25T13:30:00.000Z', 5800)
    ]);

    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T17:31:00.000Z', 20750, 0.6),
      ...buildTrendBars('ES', 'up', '2026-03-25T17:31:00.000Z', 5950, 0.4)
    ]);

    const status = service.status();
    expect(status.performance.totalPredictions).toBeGreaterThanOrEqual(1);
    expect(status.performance.evaluatedPredictions).toBeGreaterThanOrEqual(1);
    expect(status.performance.winningPredictions).toBeGreaterThanOrEqual(1);
    expect(status.performance.hitRate).toBeGreaterThan(0);
  });

  it('opens proactive experiments and learns thesis performance', async () => {
    const service = new MarketResearchService({
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 1000,
      focusSymbols: ['NQ', 'ES'],
      evaluationMinutes: 60,
      proactiveMinConfidence: 0.4
    });

    await service.start();
    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'up', '2026-03-25T13:30:00.000Z', 5800)
    ]);

    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T17:31:00.000Z', 20750, 0.6),
      ...buildTrendBars('ES', 'up', '2026-03-25T17:31:00.000Z', 5950, 0.4)
    ]);

    const status = service.status();
    expect(status.performance.proactiveExperiments).toBeGreaterThanOrEqual(1);
    expect(status.performance.evaluatedProactiveExperiments).toBeGreaterThanOrEqual(1);
    expect(status.performance.proactiveHitRate).toBeGreaterThan(0);
    expect(status.knowledgeBase.thesisPerformance.some((item) => item.thesis === 'ALIGNED_CONTINUATION')).toBe(true);
    expect(status.knowledgeBase.recentInsights.length).toBeGreaterThan(0);
  });

  it('notifies when a new high-confidence experiment opens after the initial pass', async () => {
    const openedExperiments: string[] = [];
    const service = new MarketResearchService({
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 1000,
      focusSymbols: ['NQ', 'ES'],
      proactiveMinConfidence: 0.4,
      experimentNotificationMinConfidence: 0.4,
      onExperimentOpened: async (event) => {
        openedExperiments.push(`${event.experiment.thesis}:${event.experiment.direction}`);
      }
    });

    await service.start();
    await service.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'up', '2026-03-25T13:30:00.000Z', 5800)
    ]);

    await service.ingestBars([
      ...buildTrendBars('NQ', 'down', '2026-03-25T17:31:00.000Z', 20800, 1.2),
      ...buildTrendBars('ES', 'down', '2026-03-25T17:31:00.000Z', 5980, 0.8)
    ]);

    expect(openedExperiments.length).toBeGreaterThanOrEqual(1);
  });

  it('persists the research book so autonomous learning survives restarts', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'market-research-service-'));
    const statePath = path.join(tempDir, 'research-state.json');
    const config = {
      enabled: true,
      bootstrapRecursive: true,
      maxBarsPerSymbol: 1000,
      focusSymbols: ['NQ', 'ES'] as const,
      statePath,
      proactiveMinConfidence: 0.4
    };

    const first = new MarketResearchService(config);
    await first.start();
    await first.ingestBars([
      ...buildTrendBars('NQ', 'up', '2026-03-25T13:30:00.000Z', 20100),
      ...buildTrendBars('ES', 'up', '2026-03-25T13:30:00.000Z', 5800)
    ]);

    const firstStatus = first.status();
    expect(firstStatus.knowledgeBase.totalExperiments).toBeGreaterThanOrEqual(1);

    const second = new MarketResearchService(config);
    await second.start();

    const secondStatus = second.status();
    expect(secondStatus.data.statePath).toBe(statePath);
    expect(secondStatus.knowledgeBase.totalExperiments).toBeGreaterThanOrEqual(firstStatus.knowledgeBase.totalExperiments);
    expect(secondStatus.knowledgeBase.recentInsights.length).toBeGreaterThanOrEqual(1);
  });
});
