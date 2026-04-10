import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SignalAlert } from '../../src/domain/types.js';
import { PaperAutonomyService } from '../../src/services/paperAutonomyService.js';
import type { PaperTrade, PaperTradingStatus } from '../../src/services/paperTradingService.js';

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

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
    expect(stressedAlerts.length).toBeLessThan(neutralAlerts.length);

    const neutralRiskPct = Number(neutralAlerts[0].candidate.metadata.paperAutonomyRiskPct);
    if (stressedAlerts.length > 0) {
      const stressedRiskPct = Number(stressedAlerts[0].candidate.metadata.paperAutonomyRiskPct);
      expect(stressedRiskPct).toBeLessThan(neutralRiskPct);
      expect(String(stressedAlerts[0].candidate.metadata.autonomyPortfolioAdjustment)).not.toBe('base pressure');
      return;
    }

    expect(stressedService.status().openIdeas).toBe(0);
    expect(stressedService.status().totalIdeas).toBe(0);
  });

  it('disables repeatedly failing pattern buckets instead of reopening them', async () => {
    const bars = buildAutonomyTrendBars('NQ', 420, '2026-04-01T13:00:00.000Z');
    const referenceAlerts: SignalAlert[] = [];
    let referenceTradeIndex = 0;

    const referenceService = new PaperAutonomyService({
      enabled: true,
      bootstrapRecursive: false,
      timezone: 'America/New_York',
      sessionStartHour: 0,
      sessionStartMinute: 0,
      sessionEndHour: 23,
      sessionEndMinute: 59,
      focusSymbols: ['NQ'],
      maxBarsPerSymbol: 6000,
      maxIdeas: 300,
      maxHoldMinutes: 180,
      minTrendConfidence: 0,
      breakoutLookbackBars5m: 6,
      pullbackLookbackBars5m: 8,
      getPaperTradingStatus: () => buildPaperStatus(),
      submitAlert: async (alert) => {
        referenceAlerts.push(alert);
        referenceTradeIndex += 1;
        return buildTrade(alert, referenceTradeIndex);
      }
    });

    await referenceService.ingestBars(bars);
    expect(referenceAlerts.length).toBeGreaterThan(0);

    const referenceAlert = referenceAlerts[0];
    const failingThesis = String(referenceAlert.candidate.metadata.autonomyThesis);
    const researchDirection = String(referenceAlert.candidate.metadata.researchDirection);
    const exploratory = referenceAlert.candidate.metadata.exploratory === true;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'paper-autonomy-disabled-pattern-'));
    tempDirs.push(tempDir);
    const statePath = path.join(tempDir, 'paper-autonomy.json');

    const seedIdeas = Array.from({ length: 8 }, (_, index) => {
      const openedAt = new Date(Date.parse(referenceAlert.detectedAt) - (index + 1) * 60 * 60_000).toISOString();
      const closedAt = new Date(Date.parse(openedAt) + 30 * 60_000).toISOString();
      return {
        alertId: `seed-loss-${index}`,
        candidateId: `seed-loss-candidate-${index}`,
        symbol: referenceAlert.symbol,
        side: referenceAlert.side,
        thesis: failingThesis,
        score: 61,
        reason: 'Seeded failing pattern',
        researchDirection,
        researchConfidence: 0.62,
        exploratory,
        patternKey: `${failingThesis}|${referenceAlert.symbol}|${researchDirection}|${exploratory ? 'exploratory' : 'aligned'}`,
        patternState: 'DISABLED',
        allocation: exploratory ? 'EXPLORATION' : 'CORE',
        openedAt,
        status: 'CLOSED',
        closedAt,
        realizedPnl: -125,
        realizedR: -1,
        outcome: 'LOSS'
      };
    });

    await fs.writeFile(statePath, JSON.stringify({ ideas: seedIdeas }, null, 2));

    const disabledAlerts: SignalAlert[] = [];
    let disabledTradeIndex = 0;
    const disabledService = new PaperAutonomyService({
      enabled: true,
      statePath,
      bootstrapRecursive: false,
      timezone: 'America/New_York',
      sessionStartHour: 0,
      sessionStartMinute: 0,
      sessionEndHour: 23,
      sessionEndMinute: 59,
      focusSymbols: ['NQ'],
      maxBarsPerSymbol: 6000,
      maxIdeas: 300,
      maxHoldMinutes: 180,
      minTrendConfidence: 0,
      breakoutLookbackBars5m: 6,
      pullbackLookbackBars5m: 8,
      getPaperTradingStatus: () => buildPaperStatus(),
      submitAlert: async (alert) => {
        disabledAlerts.push(alert);
        disabledTradeIndex += 1;
        return buildTrade(alert, disabledTradeIndex);
      }
    });

    await disabledService.ingestBars(bars);

    const disabledPattern = disabledService
      .status()
      .patternStates.find((entry) => entry.key === `${failingThesis}|${referenceAlert.symbol}|${researchDirection}|${exploratory ? 'exploratory' : 'aligned'}`);

    expect(disabledPattern?.state).toBe('DISABLED');
    expect(disabledPattern?.reason).toContain('Paused after underperforming');
    expect(disabledPattern?.cooldownSummary).toContain('disable guardrail');
    expect(disabledService.status().recentDecisions.some((entry) => entry.outcome === 'BLOCKED')).toBe(true);
    expect(disabledAlerts.some((alert) => String(alert.candidate.metadata.autonomyThesis) === failingThesis)).toBe(false);
  });

  it('keeps exploratory ideas inside a strict daily exploration budget', async () => {
    const exploratoryAlerts: SignalAlert[] = [];
    let exploratoryTradeIndex = 0;
    const exploratoryService = new PaperAutonomyService({
      enabled: true,
      bootstrapRecursive: false,
      timezone: 'America/New_York',
      sessionStartHour: 0,
      sessionStartMinute: 0,
      sessionEndHour: 23,
      sessionEndMinute: 59,
      focusSymbols: ['NQ'],
      maxBarsPerSymbol: 6000,
      maxIdeas: 300,
      maxHoldMinutes: 180,
      minTrendConfidence: 0.9,
      breakoutLookbackBars5m: 6,
      pullbackLookbackBars5m: 8,
      explorationBudgetFraction: 0.1,
      maxExplorationIdeasPerDay: 1,
      getPaperTradingStatus: () => buildPaperStatus(),
      submitAlert: async (alert) => {
        exploratoryAlerts.push(alert);
        exploratoryTradeIndex += 1;
        return buildTrade(alert, exploratoryTradeIndex);
      }
    });

    await exploratoryService.ingestBars(buildAutonomyTrendBars('NQ', 420, '2026-04-01T13:00:00.000Z'));

    expect(exploratoryAlerts.length).toBe(1);
    expect(exploratoryAlerts[0].candidate.metadata.exploratory).toBe(true);
    expect(exploratoryAlerts[0].candidate.metadata.autonomyPatternAllocation).toBe('EXPLORATION');
    expect(exploratoryService.status().explorationBudget.usedToday).toBe(1);
    expect(exploratoryService.status().explorationBudget.allowedToday).toBe(1);
    expect(exploratoryService.status().explorationBudget.remainingToday).toBe(0);
    expect(exploratoryService.status().explorationBudget.available).toBe(false);
    expect(exploratoryService.status().recentDecisions.length).toBeGreaterThan(0);
  });
});
