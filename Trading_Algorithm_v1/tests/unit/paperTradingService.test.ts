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
      maxConcurrentTrades: 3,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
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
      maxConcurrentTrades: 3,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
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
      maxConcurrentTrades: 3,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const trade = await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'manual-test');
    expect(trade).toBeNull();
    expect(service.status().openTrades).toBe(0);
    expect(service.status().pendingEntries).toBe(0);
  });

  it('emits open and close events and records equity history as trades progress', async () => {
    const events: Array<{ kind: string; at: string }> = [];
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 3,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24,
      onTradeEvent: (event) => {
        events.push({ kind: event.kind, at: event.at });
      }
    });

    await service.start();
    await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'signal-monitor');
    await service.ingestBars([
      {
        symbol: 'NQ',
        timestamp: '2026-03-25T13:31:00.000Z',
        open: 100.1,
        high: 100.4,
        low: 99.9,
        close: 100.2,
        volume: 100
      },
      {
        symbol: 'NQ',
        timestamp: '2026-03-25T13:32:00.000Z',
        open: 100.2,
        high: 108.5,
        low: 100.1,
        close: 108.2,
        volume: 120
      }
    ]);

    const status = service.status('2026-03-25T13:32:00.000Z');
    expect(events.map((event) => event.kind)).toEqual(['TRADE_OPENED', 'TRADE_CLOSED']);
    expect(status.equityHistory.length).toBeGreaterThanOrEqual(3);
    expect(status.recentClosedTrades[0].status).toBe('CLOSED');
  });

  it('records multiple allowed alerts for the same symbol and side so the paper engine can learn from the full stream', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 3,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const firstTrade = await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'signal-monitor');
    const secondTrade = await service.recordAlert(
      buildAlert('2026-03-25T13:35:00.000Z', {
        alertId: 'alert-2',
        candidate: {
          ...buildAlert('2026-03-25T13:35:00.000Z').candidate,
          id: 'candidate-2',
          generatedAt: '2026-03-25T13:35:00.000Z'
        }
      }),
      'signal-monitor'
    );

    const status = service.status('2026-03-25T13:35:00.000Z');
    expect(firstTrade).not.toBeNull();
    expect(secondTrade).not.toBeNull();
    expect(status.pendingEntries).toBe(2);
  });

  it('takes blocked live alerts in unrestricted autonomy mode and sizes them from paper equity', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 0,
      autonomyMode: 'UNRESTRICTED',
      autonomyRiskPct: 0.35,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const trade = await service.recordAlert(
      buildAlert('2026-03-25T13:30:00.000Z', {
        riskDecision: {
          allowed: false,
          finalRiskPct: 0,
          positionSize: 0,
          reasonCodes: ['OUTSIDE_ALLOWED_TRADING_WINDOW'],
          blockedByNewsWindow: false,
          blockedByTradingWindow: true,
          blockedByPolicy: false,
          checkedAt: '2026-03-25T13:30:00.000Z'
        }
      }),
      'signal-monitor'
    );

    expect(trade).not.toBeNull();
    expect(trade?.quantity).toBeGreaterThan(0);
    expect(trade?.riskPct).toBe(0.35);
    expect(service.status().pendingEntries).toBe(1);
  });

  it('accepts autonomous candidates only in unrestricted mode', async () => {
    const unrestricted = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 0,
      autonomyMode: 'UNRESTRICTED',
      autonomyRiskPct: 0.35,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });
    const restricted = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 0,
      autonomyMode: 'FOLLOW_ALLOWED_ALERTS',
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await unrestricted.start();
    await restricted.start();

    const autonomousAlert = buildAlert('2026-03-25T13:30:00.000Z', {
      alertId: 'paper-auto:NQ|NY_BREAK_RETEST_MOMENTUM|LONG|2026-03-25T13:30:00.000Z'
    });

    const unrestrictedTrade = await unrestricted.recordAlert(autonomousAlert, 'signal-monitor-autonomous');
    const restrictedTrade = await restricted.recordAlert(autonomousAlert, 'signal-monitor-autonomous');

    expect(unrestrictedTrade).not.toBeNull();
    expect(restrictedTrade).toBeNull();
  });

  it('does not double-enter the same candidate when both autonomous and live paths see it', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 0,
      autonomyMode: 'UNRESTRICTED',
      autonomyRiskPct: 0.35,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const candidate = buildAlert('2026-03-25T13:30:00.000Z').candidate;
    const autonomousTrade = await service.recordAlert(
      buildAlert('2026-03-25T13:30:00.000Z', {
        alertId: 'paper-auto:NQ|NY_BREAK_RETEST_MOMENTUM|LONG|2026-03-25T13:30:00.000Z',
        candidate
      }),
      'signal-monitor-autonomous'
    );
    const liveTrade = await service.recordAlert(
      buildAlert('2026-03-25T13:30:00.000Z', {
        alertId: 'live-alert-1',
        candidate
      }),
      'signal-monitor'
    );

    expect(autonomousTrade).not.toBeNull();
    expect(liveTrade?.paperTradeId).toBe(autonomousTrade?.paperTradeId);
    expect(service.status().pendingEntries).toBe(1);
  });

  it('treats a zero concurrency cap as unlimited in unrestricted mode', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 0,
      autonomyMode: 'UNRESTRICTED',
      autonomyRiskPct: 0.35,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const firstTrade = await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'signal-monitor');
    const secondTrade = await service.recordAlert(
      buildAlert('2026-03-25T13:35:00.000Z', {
        alertId: 'alert-2',
        candidate: {
          ...buildAlert('2026-03-25T13:35:00.000Z').candidate,
          id: 'candidate-2',
          generatedAt: '2026-03-25T13:35:00.000Z'
        }
      }),
      'signal-monitor'
    );

    expect(firstTrade).not.toBeNull();
    expect(secondTrade).not.toBeNull();
    expect(service.status().pendingEntries).toBe(2);
  });

  it('respects the configured max concurrent paper trades cap', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 1,
      autonomyMode: 'FOLLOW_ALLOWED_ALERTS',
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const firstTrade = await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'signal-monitor');
    const secondTrade = await service.recordAlert(
      buildAlert('2026-03-25T13:35:00.000Z', {
        alertId: 'alert-2',
        candidate: {
          ...buildAlert('2026-03-25T13:35:00.000Z').candidate,
          id: 'candidate-2',
          generatedAt: '2026-03-25T13:35:00.000Z'
        }
      }),
      'signal-monitor'
    );

    expect(firstTrade).not.toBeNull();
    expect(secondTrade).toBeNull();
    expect(service.status('2026-03-25T13:35:00.000Z').pendingEntries).toBe(1);
  });

  it('updates autonomy settings through config changes', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 1,
      autonomyMode: 'FOLLOW_ALLOWED_ALERTS',
      autonomyRiskPct: 0.25,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const status = await service.updateConfig({
      maxConcurrentTrades: 0,
      autonomyMode: 'UNRESTRICTED',
      autonomyRiskPct: 0.5
    });

    expect(status.maxConcurrentTrades).toBe(0);
    expect(status.autonomyMode).toBe('UNRESTRICTED');
    expect(status.autonomyRiskPct).toBe(0.5);
  });

  it('treats unrestricted autonomy as uncapped even if a concurrent trade cap is supplied', async () => {
    const service = new PaperTradingService({
      enabled: true,
      initialBalance: 100_000,
      maxHoldMinutes: 60,
      maxConcurrentTrades: 1,
      autonomyMode: 'UNRESTRICTED',
      autonomyRiskPct: 0.35,
      timezone: 'America/New_York',
      sessionStartHour: 8,
      sessionStartMinute: 30,
      maxClosedTrades: 20,
      maxEquityHistory: 24
    });

    await service.start();
    const firstTrade = await service.recordAlert(buildAlert('2026-03-25T13:30:00.000Z'), 'paper-autonomy');
    const secondTrade = await service.recordAlert(
      buildAlert('2026-03-25T13:35:00.000Z', {
        alertId: 'paper-alert-2',
        candidate: {
          ...buildAlert('2026-03-25T13:35:00.000Z').candidate,
          id: 'paper-candidate-2',
          generatedAt: '2026-03-25T13:35:00.000Z',
          metadata: {
            paperAutonomyRiskPct: 0.65
          }
        }
      }),
      'paper-autonomy'
    );

    expect(firstTrade).not.toBeNull();
    expect(secondTrade).not.toBeNull();
    expect(service.status('2026-03-25T13:35:00.000Z').maxConcurrentTrades).toBe(0);
    expect(service.status('2026-03-25T13:35:00.000Z').pendingEntries).toBe(2);
  });
});
