import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PaperTradingService } from '../../src/services/paperTradingService.js';
import type { SignalAlert } from '../../src/domain/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

const buildAlert = (detectedAt: string, overrides: Partial<SignalAlert> = {}): SignalAlert => ({
  alertId: 'alert-1',
  symbol: 'NQ',
  setupType: 'NY_BREAK_RETEST_MOMENTUM',
  side: 'LONG',
  detectedAt,
  rankingModelId: 'ranking-model-test',
  title: 'NQ LONG setup',
  summary: 'Paper-trading test alert',
  candidate: {
    id: 'candidate-1',
    setupType: 'NY_BREAK_RETEST_MOMENTUM',
    symbol: 'NQ',
    session: 'NY',
    detectionTimeframe: '5m',
    executionTimeframe: '5m',
    side: 'LONG',
    entry: 100,
    stopLoss: 95,
    takeProfit: [108],
    baseScore: 80,
    oneMinuteConfidence: 0.7,
    finalScore: 82,
    eligibility: {
      passed: true,
      passReasons: ['pass'],
      failReasons: []
    },
    metadata: {},
    generatedAt: detectedAt
  },
  riskDecision: {
    allowed: true,
    finalRiskPct: 0.5,
    positionSize: 100,
    reasonCodes: [],
    blockedByNewsWindow: false,
    blockedByTradingWindow: false,
    blockedByPolicy: false,
    checkedAt: detectedAt
  },
  ...overrides
});

describe('paper trading service', () => {
  it('opens from a live alert and settles a winning trade from future bars', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-trading-'));
    tempDirs.push(tempDir);

    const service = new PaperTradingService({
      enabled: true,
      statePath: path.join(tempDir, 'paper-account.json'),
      initialBalance: 100_000,
      maxHoldMinutes: 120,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20
    });

    await service.start();
    await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'signal-monitor');
    await service.ingestBars([
      {
        symbol: 'NQ',
        timestamp: '2026-03-25T13:31:00.000Z',
        open: 100.2,
        high: 108.5,
        low: 99.8,
        close: 108.2,
        volume: 100
      }
    ]);

    const status = service.status('2026-03-25T13:31:00.000Z');
    expect(status.closedTrades).toBe(1);
    expect(status.winningTrades).toBe(1);
    expect(status.balance).toBeGreaterThan(100_000);
    expect(status.recentClosedTrades[0].exitReason).toBe('TAKE_PROFIT');
    expect(status.accountSnapshot.equity).toBe(status.equity);
  });

  it('expires a pending entry if price never trades the entry level', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-trading-expire-'));
    tempDirs.push(tempDir);

    const service = new PaperTradingService({
      enabled: true,
      statePath: path.join(tempDir, 'paper-account.json'),
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20
    });

    await service.start();
    await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'signal-monitor');
    await service.ingestBars([
      {
        symbol: 'NQ',
        timestamp: '2026-03-25T14:31:00.000Z',
        open: 111,
        high: 112,
        low: 110.5,
        close: 111.5,
        volume: 100
      }
    ]);

    const status = service.status('2026-03-25T14:31:00.000Z');
    expect(status.canceledTrades).toBe(1);
    expect(status.closedTrades).toBe(0);
    expect(status.balance).toBe(100_000);
    expect(status.recentClosedTrades[0].exitReason).toBe('ENTRY_EXPIRED');
  });

  it('ignores manual test alerts so the paper account only tracks live engine trades', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20
    });

    await service.start();
    const trade = await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'manual-test');
    expect(trade).toBeNull();
    expect(service.status().openTrades).toBe(0);
    expect(service.status().pendingEntries).toBe(0);
  });
});
