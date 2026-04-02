import { describe, expect, it } from 'vitest';
import type { SignalAlert } from '../../src/domain/types.js';
import { PaperAutonomyService } from '../../src/services/paperAutonomyService.js';
import type { PaperTrade, PaperTradingStatus } from '../../src/services/paperTradingService.js';

const buildAutonomyTrendBars = (symbol: 'NQ' | 'ES' = 'NQ', count = 330, startAt = '2026-04-01T22:00:00.000Z') => {
  const bars = [];
  const startMs = Date.parse(startAt);

  for (let index = 0; index < count; index += 1) {
    const trend = index * 0.18;
    const pullback = Math.sin(index / 8) * 0.42;
    const impulse = index > 260 ? (index - 260) * 0.05 : 0;
    const close = 20000 + trend + pullback + impulse;
    const open = close - 0.08;
    const high = close + 0.16 + (index > 300 ? 0.06 : 0);
    const low = close - 0.2;

    bars.push({
      symbol,
      timestamp: new Date(startMs + index * 60_000).toISOString(),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 100 + index
    });
  }

  return bars;
};

const buildPaperStatus = (overrides: Partial<PaperTradingStatus> = {}): PaperTradingStatus => ({
  enabled: true,
  started: true,
  initialBalance: 100_000,
  maxConcurrentTrades: 0,
  autonomyMode: 'UNRESTRICTED',
  autonomyRiskPct: 0.35,
  balance: 100_000,
  equity: 100_000,
  realizedPnl: 0,
  unrealizedPnl: 0,
  openTrades: 0,
  pendingEntries: 0,
  closedTrades: 0,
  canceledTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  hitRate: 0,
  accountSnapshot: {
    equity: 100_000,
    dailyLossPct: 0,
    sessionLossPct: 0,
    consecutiveLosses: 0
  },
  equityHistory: [],
  recentOpenTrades: [],
  recentClosedTrades: [],
  ...overrides
});

const buildTrade = (alert: SignalAlert, index: number): PaperTrade => ({
  paperTradeId: `paper-${index}`,
  alertId: alert.alertId,
  candidateId: alert.candidate.id,
  symbol: alert.symbol,
  setupType: alert.setupType,
  side: alert.side,
  status: 'PENDING_ENTRY',
  submittedAt: alert.detectedAt,
  expiresAt: String(alert.candidate.metadata.paperTradeExpiresAt ?? alert.detectedAt),
  entry: alert.candidate.entry,
  stopLoss: alert.candidate.stopLoss,
  takeProfit: alert.candidate.takeProfit[0] ?? alert.candidate.entry,
  quantity: 1,
  riskPct: Number(alert.candidate.metadata.paperAutonomyRiskPct ?? 0.35),
  riskAmount: 100,
  source: 'paper-autonomy'
});

describe('paper autonomy service', () => {
  it('self-corrects by reducing risk and trade frequency when the paper portfolio is under stress', async () => {
    const neutralAlerts: SignalAlert[] = [];
    const stressedAlerts: SignalAlert[] = [];
    let neutralTradeIndex = 0;
    let stressedTradeIndex = 0;

    const neutralService = new PaperAutonomyService({
      enabled: true,
      bootstrapRecursive: false,
      timezone: 'America/New_York',
      sessionStartHour: 0,
      sessionStartMinute: 0,
      sessionEndHour: 23,
      sessionEndMinute: 59,
      focusSymbols: ['NQ', 'ES'],
      maxBarsPerSymbol: 6000,
      maxIdeas: 300,
      maxHoldMinutes: 180,
      minTrendConfidence: 0,
      breakoutLookbackBars5m: 6,
      pullbackLookbackBars5m: 8,
      getPaperTradingStatus: () => buildPaperStatus(),
      submitAlert: async (alert) => {
        neutralAlerts.push(alert);
        neutralTradeIndex += 1;
        return buildTrade(alert, neutralTradeIndex);
      }
    });

    const stressedService = new PaperAutonomyService({
      enabled: true,
      bootstrapRecursive: false,
      timezone: 'America/New_York',
      sessionStartHour: 0,
      sessionStartMinute: 0,
      sessionEndHour: 23,
      sessionEndMinute: 59,
      focusSymbols: ['NQ', 'ES'],
      maxBarsPerSymbol: 6000,
      maxIdeas: 300,
      maxHoldMinutes: 180,
      minTrendConfidence: 0,
      breakoutLookbackBars5m: 6,
      pullbackLookbackBars5m: 8,
      getPaperTradingStatus: () => buildPaperStatus({
        equity: 98_500,
        balance: 98_900,
        realizedPnl: -1_100,
        unrealizedPnl: -400,
        openTrades: 4,
        pendingEntries: 6,
        closedTrades: 12,
        winningTrades: 4,
        losingTrades: 8,
        hitRate: 0.33
      }),
      submitAlert: async (alert) => {
        stressedAlerts.push(alert);
        stressedTradeIndex += 1;
        return buildTrade(alert, stressedTradeIndex);
      }
    });

    const bars = buildAutonomyTrendBars();
    await neutralService.ingestBars(bars);
    await stressedService.ingestBars(bars);

    expect(neutralAlerts.length).toBeGreaterThan(0);
    expect(stressedAlerts.length).toBeGreaterThan(0);
    expect(stressedAlerts.length).toBeLessThan(neutralAlerts.length);

    const neutralRiskPct = Number(neutralAlerts[0].candidate.metadata.paperAutonomyRiskPct);
    const stressedRiskPct = Number(stressedAlerts[0].candidate.metadata.paperAutonomyRiskPct);
    expect(stressedRiskPct).toBeLessThan(neutralRiskPct);
    expect(String(stressedAlerts[0].candidate.metadata.autonomyPortfolioAdjustment)).not.toBe('base pressure');
  });
});
