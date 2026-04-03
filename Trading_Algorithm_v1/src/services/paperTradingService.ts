import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { isCmeEquitySessionOpen } from '../domain/cmeEquityHours.js';
import type { AccountSnapshot, SetupType, SignalAlert, Side, SymbolCode } from '../domain/types.js';
import type { OneMinuteBar } from '../training/historicalTrainer.js';

type PaperTradeStatus = 'PENDING_ENTRY' | 'OPEN' | 'CLOSED' | 'CANCELED';
type PaperTradeExitReason = 'TAKE_PROFIT' | 'STOP_LOSS' | 'TIME_EXIT' | 'ENTRY_EXPIRED';
export type PaperTradeEventKind = 'TRADE_OPENED' | 'TRADE_CLOSED';

export interface PaperTrade {
  paperTradeId: string;
  alertId: string;
  candidateId: string;
  symbol: SymbolCode;
  setupType: SetupType;
  side: Side;
  status: PaperTradeStatus;
  submittedAt: string;
  expiresAt: string;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  quantity: number;
  riskPct: number;
  riskAmount: number;
  source: string;
  autonomyThesis?: string;
  autonomyReason?: string;
  researchDirection?: string;
  filledAt?: string;
  filledPrice?: number;
  closedAt?: string;
  exitPrice?: number;
  exitReason?: PaperTradeExitReason;
  realizedPnl?: number;
  realizedR?: number;
}

export interface PaperTradingConfig {
  enabled: boolean;
  statePath?: string;
  initialBalance: number;
  maxHoldMinutes: number;
  maxConcurrentTrades: number;
  autonomyMode?: 'FOLLOW_ALLOWED_ALERTS' | 'UNRESTRICTED';
  autonomyRiskPct?: number;
  timezone: string;
  sessionStartHour: number;
  sessionStartMinute: number;
  maxClosedTrades: number;
  maxEquityHistory: number;
  onTradeEvent?: (event: PaperTradeEvent) => void | Promise<void>;
}

export interface PaperTradeEquityPoint {
  at: string;
  equity: number;
  balance: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface PaperTradeEvent {
  kind: PaperTradeEventKind;
  at: string;
  trade: PaperTrade;
  equityPoint: PaperTradeEquityPoint;
}

export interface PaperTradingStatus {
  enabled: boolean;
  started: boolean;
  statePath?: string;
  initialBalance: number;
  maxConcurrentTrades: number;
  autonomyMode: 'FOLLOW_ALLOWED_ALERTS' | 'UNRESTRICTED';
  autonomyRiskPct: number;
  balance: number;
  equity: number;
  realizedPnl: number;
  unrealizedPnl: number;
  openTrades: number;
  pendingEntries: number;
  closedTrades: number;
  canceledTrades: number;
  winningTrades: number;
  losingTrades: number;
  hitRate: number;
  lastUpdatedAt?: string;
  accountSnapshot: AccountSnapshot;
  equityHistory: PaperTradeEquityPoint[];
  recentOpenTrades: PaperTrade[];
  recentClosedTrades: PaperTrade[];
}

const PAPER_SIGNAL_SOURCES = new Set(['signal-monitor', 'signal-monitor-autonomous', 'paper-autonomy']);

const isPaperSignalSource = (source: string): boolean => PAPER_SIGNAL_SOURCES.has(source);

const asOptionalIsoTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return new Date(ms).toISOString();
};

interface PersistedPaperTradingState {
  balance: number;
  lastUpdatedAt?: string;
  trades: PaperTrade[];
  equityHistory?: PaperTradeEquityPoint[];
  settings?: {
    maxConcurrentTrades?: number;
    autonomyMode?: 'FOLLOW_ALLOWED_ALERTS' | 'UNRESTRICTED';
    autonomyRiskPct?: number;
  };
}

const MAX_RECENT_TRADES = 8;

const normalizeEquityPoint = (value: unknown): PaperTradeEquityPoint | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PaperTradeEquityPoint>;
  if (
    typeof candidate.at !== 'string'
    || typeof candidate.equity !== 'number'
    || typeof candidate.balance !== 'number'
    || typeof candidate.realizedPnl !== 'number'
    || typeof candidate.unrealizedPnl !== 'number'
  ) {
    return null;
  }

  return {
    at: candidate.at,
    equity: round(candidate.equity, 2),
    balance: round(candidate.balance, 2),
    realizedPnl: round(candidate.realizedPnl, 2),
    unrealizedPnl: round(candidate.unrealizedPnl, 2)
  };
};

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const normalizeConcurrentTradeCap = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(value));
};

const normalizeAutonomyRiskPct = (value: number): number => Math.max(0.01, Number(value.toFixed(2)));

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const getLocalTimeParts = (
  timestamp: string,
  timezone: string
): { dayKey: string; minuteOfDay: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const find = (type: Intl.DateTimeFormatPartTypes): string => parts.find((entry) => entry.type === type)?.value ?? '00';
  const year = find('year');
  const month = find('month');
  const day = find('day');
  const hour = Number(find('hour'));
  const minute = Number(find('minute'));
  return {
    dayKey: `${year}-${month}-${day}`,
    minuteOfDay: hour * 60 + minute
  };
};

const normalizeTrade = (value: unknown): PaperTrade | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<PaperTrade>;
  if (
    typeof candidate.paperTradeId !== 'string'
    || typeof candidate.alertId !== 'string'
    || typeof candidate.candidateId !== 'string'
    || (candidate.symbol !== 'NQ' && candidate.symbol !== 'ES')
    || typeof candidate.setupType !== 'string'
    || (candidate.side !== 'LONG' && candidate.side !== 'SHORT')
    || !['PENDING_ENTRY', 'OPEN', 'CLOSED', 'CANCELED'].includes(String(candidate.status))
    || typeof candidate.submittedAt !== 'string'
    || typeof candidate.expiresAt !== 'string'
    || typeof candidate.entry !== 'number'
    || typeof candidate.stopLoss !== 'number'
    || typeof candidate.takeProfit !== 'number'
    || typeof candidate.quantity !== 'number'
    || typeof candidate.riskPct !== 'number'
    || typeof candidate.riskAmount !== 'number'
    || typeof candidate.source !== 'string'
  ) {
    return null;
  }

  return {
    paperTradeId: candidate.paperTradeId,
    alertId: candidate.alertId,
    candidateId: candidate.candidateId,
    symbol: candidate.symbol,
    setupType: candidate.setupType as SetupType,
    side: candidate.side,
    status: candidate.status as PaperTradeStatus,
    submittedAt: candidate.submittedAt,
    expiresAt: candidate.expiresAt,
    entry: round(candidate.entry, 4),
    stopLoss: round(candidate.stopLoss, 4),
    takeProfit: round(candidate.takeProfit, 4),
    quantity: round(candidate.quantity, 4),
    riskPct: round(candidate.riskPct, 4),
    riskAmount: round(candidate.riskAmount, 4),
    source: candidate.source,
    autonomyThesis: typeof candidate.autonomyThesis === 'string' ? candidate.autonomyThesis : undefined,
    autonomyReason: typeof candidate.autonomyReason === 'string' ? candidate.autonomyReason : undefined,
    researchDirection: typeof candidate.researchDirection === 'string' ? candidate.researchDirection : undefined,
    filledAt: typeof candidate.filledAt === 'string' ? candidate.filledAt : undefined,
    filledPrice: typeof candidate.filledPrice === 'number' ? round(candidate.filledPrice, 4) : undefined,
    closedAt: typeof candidate.closedAt === 'string' ? candidate.closedAt : undefined,
    exitPrice: typeof candidate.exitPrice === 'number' ? round(candidate.exitPrice, 4) : undefined,
    exitReason:
      candidate.exitReason === 'TAKE_PROFIT'
      || candidate.exitReason === 'STOP_LOSS'
      || candidate.exitReason === 'TIME_EXIT'
      || candidate.exitReason === 'ENTRY_EXPIRED'
        ? candidate.exitReason
        : undefined,
    realizedPnl: typeof candidate.realizedPnl === 'number' ? round(candidate.realizedPnl, 2) : undefined,
    realizedR: typeof candidate.realizedR === 'number' ? round(candidate.realizedR, 2) : undefined
  };
};

export class PaperTradingService {
  private started = false;
  private startPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private trades = new Map<string, PaperTrade>();
  private latestPriceBySymbol = new Map<SymbolCode, number>();
  private equityHistory: PaperTradeEquityPoint[] = [];
  private balance: number;
  private lastUpdatedAt: string | undefined;
  private maxConcurrentTrades: number;
  private autonomyMode: 'FOLLOW_ALLOWED_ALERTS' | 'UNRESTRICTED';
  private autonomyRiskPct: number;

  constructor(private readonly config: PaperTradingConfig) {
    this.balance = config.initialBalance;
    this.autonomyMode = config.autonomyMode === 'FOLLOW_ALLOWED_ALERTS' ? 'FOLLOW_ALLOWED_ALERTS' : 'UNRESTRICTED';
    this.maxConcurrentTrades =
      this.autonomyMode === 'UNRESTRICTED' ? 0 : normalizeConcurrentTradeCap(config.maxConcurrentTrades);
    this.autonomyRiskPct = normalizeAutonomyRiskPct(config.autonomyRiskPct ?? 0.35);
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.started) {
      return;
    }

    if (!this.startPromise) {
      this.startPromise = this.load();
    }

    await this.startPromise;
    if (this.equityHistory.length === 0) {
      this.pushEquityPoint(this.lastUpdatedAt ?? new Date().toISOString());
      await this.persist();
    }
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  private async load(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }

    try {
      const raw = await fs.readFile(this.config.statePath, 'utf8');
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        this.balance = this.config.initialBalance;
        this.lastUpdatedAt = undefined;
        this.trades.clear();
        return;
      }
      const parsed = JSON.parse(trimmed) as Partial<PersistedPaperTradingState>;
      this.balance =
        typeof parsed.balance === 'number' && Number.isFinite(parsed.balance)
          ? round(parsed.balance, 2)
          : this.config.initialBalance;
      this.lastUpdatedAt = typeof parsed.lastUpdatedAt === 'string' ? parsed.lastUpdatedAt : undefined;
      this.trades = new Map(
        (Array.isArray(parsed.trades) ? parsed.trades : [])
          .map((trade) => normalizeTrade(trade))
          .filter((trade): trade is PaperTrade => trade !== null)
          .map((trade) => [trade.alertId, trade])
      );
      this.equityHistory = (Array.isArray(parsed.equityHistory) ? parsed.equityHistory : [])
        .map((point) => normalizeEquityPoint(point))
        .filter((point): point is PaperTradeEquityPoint => point !== null)
        .slice(-this.config.maxEquityHistory);
      if (parsed.settings?.autonomyMode === 'FOLLOW_ALLOWED_ALERTS' || parsed.settings?.autonomyMode === 'UNRESTRICTED') {
        this.autonomyMode = parsed.settings.autonomyMode;
      }
      const persistedMaxConcurrentTrades = parsed.settings?.maxConcurrentTrades;
      if (typeof persistedMaxConcurrentTrades === 'number' && Number.isFinite(persistedMaxConcurrentTrades)) {
        const normalizedPersistedCap = normalizeConcurrentTradeCap(persistedMaxConcurrentTrades);
        this.maxConcurrentTrades = this.autonomyMode === 'UNRESTRICTED' ? 0 : normalizedPersistedCap;
      }
      if (typeof parsed.settings?.autonomyRiskPct === 'number' && Number.isFinite(parsed.settings.autonomyRiskPct)) {
        this.autonomyRiskPct = normalizeAutonomyRiskPct(parsed.settings.autonomyRiskPct);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (error instanceof SyntaxError || err.code === 'ENOENT') {
        this.balance = this.config.initialBalance;
        this.lastUpdatedAt = undefined;
        this.trades.clear();
        this.equityHistory = [];
        return;
      }
      if (err.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async persist(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }

    const snapshot: PersistedPaperTradingState = {
      balance: round(this.balance, 2),
      lastUpdatedAt: this.lastUpdatedAt,
      trades: this.listTrades(),
      equityHistory: this.equityHistory,
      settings: {
        maxConcurrentTrades: this.maxConcurrentTrades,
        autonomyMode: this.autonomyMode,
        autonomyRiskPct: this.autonomyRiskPct
      }
    };

    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.config.statePath as string), { recursive: true });
      await fs.writeFile(this.config.statePath as string, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    });
    await this.writeChain;
  }

  private listTrades(): PaperTrade[] {
    return [...this.trades.values()].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  }

  private getTradeUnrealizedPnl(trade: PaperTrade): number {
    if (trade.status !== 'OPEN' || trade.filledPrice === undefined) {
      return 0;
    }

    const latestPrice = this.latestPriceBySymbol.get(trade.symbol);
    if (latestPrice === undefined) {
      return 0;
    }

    const direction = trade.side === 'LONG' ? 1 : -1;
    return round((latestPrice - trade.filledPrice) * direction * trade.quantity, 2);
  }

  private isEntryTouched(trade: PaperTrade, bar: OneMinuteBar): boolean {
    return bar.low <= trade.entry && bar.high >= trade.entry;
  }

  private computeEquityBreakdown(): { equity: number; balance: number; realizedPnl: number; unrealizedPnl: number } {
    const openTrades = [...this.trades.values()].filter((trade) => trade.status === 'OPEN');
    const unrealizedPnl = round(openTrades.reduce((sum, trade) => sum + this.getTradeUnrealizedPnl(trade), 0), 2);
    const realizedPnl = round(this.balance - this.config.initialBalance, 2);
    return {
      equity: round(this.balance + unrealizedPnl, 2),
      balance: round(this.balance, 2),
      realizedPnl,
      unrealizedPnl
    };
  }

  private captureEquityPoint(at: string): PaperTradeEquityPoint {
    const breakdown = this.computeEquityBreakdown();
    return {
      at,
      ...breakdown
    };
  }

  private pushEquityPoint(at: string): PaperTradeEquityPoint {
    const point = this.captureEquityPoint(at);
    const last = this.equityHistory.at(-1);
    if (
      last
      && last.at === point.at
      && last.equity === point.equity
      && last.balance === point.balance
      && last.realizedPnl === point.realizedPnl
      && last.unrealizedPnl === point.unrealizedPnl
    ) {
      return last;
    }

    this.equityHistory.push(point);
    this.equityHistory = this.equityHistory.slice(-this.config.maxEquityHistory);
    return point;
  }

  private closeTrade(trade: PaperTrade, closedAt: string, exitPrice: number, exitReason: PaperTradeExitReason): PaperTrade {
    const direction = trade.side === 'LONG' ? 1 : -1;
    const filledPrice = trade.filledPrice ?? trade.entry;
    const realizedPnl = exitReason === 'ENTRY_EXPIRED'
      ? 0
      : round((exitPrice - filledPrice) * direction * trade.quantity, 2);
    const realizedR = trade.riskAmount > 0 ? round(realizedPnl / trade.riskAmount, 2) : 0;
    if (exitReason !== 'ENTRY_EXPIRED') {
      this.balance = round(this.balance + realizedPnl, 2);
    }

    return {
      ...trade,
      status: exitReason === 'ENTRY_EXPIRED' ? 'CANCELED' : 'CLOSED',
      closedAt,
      exitPrice: round(exitPrice, 4),
      exitReason,
      realizedPnl,
      realizedR
    };
  }

  private evaluateOpenTradeAgainstBar(trade: PaperTrade, bar: OneMinuteBar): PaperTrade {
    if (trade.status === 'CLOSED' || trade.status === 'CANCELED') {
      return trade;
    }

    let nextTrade = trade;

    if (trade.status === 'PENDING_ENTRY') {
      if (Date.parse(bar.timestamp) >= Date.parse(trade.expiresAt)) {
        return this.closeTrade(trade, bar.timestamp, trade.entry, 'ENTRY_EXPIRED');
      }
      if (!this.isEntryTouched(trade, bar)) {
        return trade;
      }
      nextTrade = {
        ...trade,
        status: 'OPEN',
        filledAt: bar.timestamp,
        filledPrice: trade.entry
      };
    }

    if (Date.parse(bar.timestamp) >= Date.parse(nextTrade.expiresAt)) {
      return this.closeTrade(nextTrade, bar.timestamp, bar.close, 'TIME_EXIT');
    }

    if (nextTrade.side === 'LONG') {
      const stopHit = bar.low <= nextTrade.stopLoss;
      const targetHit = bar.high >= nextTrade.takeProfit;
      if (stopHit && targetHit) {
        return this.closeTrade(nextTrade, bar.timestamp, nextTrade.stopLoss, 'STOP_LOSS');
      }
      if (stopHit) {
        return this.closeTrade(nextTrade, bar.timestamp, nextTrade.stopLoss, 'STOP_LOSS');
      }
      if (targetHit) {
        return this.closeTrade(nextTrade, bar.timestamp, nextTrade.takeProfit, 'TAKE_PROFIT');
      }
      return nextTrade;
    }

    const stopHit = bar.high >= nextTrade.stopLoss;
    const targetHit = bar.low <= nextTrade.takeProfit;
    if (stopHit && targetHit) {
      return this.closeTrade(nextTrade, bar.timestamp, nextTrade.stopLoss, 'STOP_LOSS');
    }
    if (stopHit) {
      return this.closeTrade(nextTrade, bar.timestamp, nextTrade.stopLoss, 'STOP_LOSS');
    }
    if (targetHit) {
      return this.closeTrade(nextTrade, bar.timestamp, nextTrade.takeProfit, 'TAKE_PROFIT');
    }
    return nextTrade;
  }

  async recordAlert(alert: SignalAlert, source: string): Promise<PaperTrade | null> {
    if (!this.config.enabled || !isPaperSignalSource(source)) {
      return null;
    }
    await this.start();

    if (!isCmeEquitySessionOpen(alert.detectedAt)) {
      return null;
    }

    if (this.trades.has(alert.alertId)) {
      return this.trades.get(alert.alertId) ?? null;
    }

    const existingTrade = [...this.trades.values()].find((trade) => trade.candidateId === alert.candidate.id);
    if (existingTrade) {
      return existingTrade;
    }

    if ((source === 'signal-monitor-autonomous' || source === 'paper-autonomy') && this.autonomyMode !== 'UNRESTRICTED') {
      return null;
    }

    if (this.autonomyMode === 'FOLLOW_ALLOWED_ALERTS' && !alert.riskDecision.allowed) {
      return null;
    }

    const stopDistance = Math.abs(alert.candidate.entry - alert.candidate.stopLoss);
    if (stopDistance <= 0) {
      return null;
    }

    const paperEquity = this.computeEquityBreakdown().equity;
    const metadataRiskPct =
      this.autonomyMode === 'UNRESTRICTED' && source === 'paper-autonomy'
        ? (() => {
            const raw = alert.candidate.metadata.paperAutonomyRiskPct;
            return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? normalizeAutonomyRiskPct(raw) : undefined;
          })()
        : undefined;
    const autonomousRiskPct = metadataRiskPct ?? this.autonomyRiskPct;
    const autonomousRiskAmount = round(paperEquity * (autonomousRiskPct / 100), 2);
    const autonomousQuantity = Number((autonomousRiskAmount / stopDistance).toFixed(4));
    const derivedQuantity =
      this.autonomyMode === 'UNRESTRICTED'
        ? autonomousQuantity
        : round(alert.riskDecision.positionSize, 4);
    const derivedRiskPct =
      this.autonomyMode === 'UNRESTRICTED'
        ? autonomousRiskPct
        : round(alert.riskDecision.finalRiskPct, 4);
    const riskAmount = round(stopDistance * derivedQuantity, 2);

    if (riskAmount <= 0 || derivedQuantity <= 0) {
      return null;
    }

    const concurrentTrades = [...this.trades.values()].filter(
      (trade) => trade.status === 'PENDING_ENTRY' || trade.status === 'OPEN'
    ).length;
    if (this.autonomyMode !== 'UNRESTRICTED' && this.maxConcurrentTrades > 0 && concurrentTrades >= this.maxConcurrentTrades) {
      return null;
    }

    const metadataExpiry = asOptionalIsoTimestamp(alert.candidate.metadata.paperTradeExpiresAt);
    const defaultExpiry = new Date(Date.parse(alert.detectedAt) + this.config.maxHoldMinutes * 60_000).toISOString();
    const expiresAt =
      metadataExpiry && Date.parse(metadataExpiry) > Date.parse(alert.detectedAt)
        ? metadataExpiry
        : defaultExpiry;

    const trade: PaperTrade = {
      paperTradeId: uuidv4(),
      alertId: alert.alertId,
      candidateId: alert.candidate.id,
      symbol: alert.symbol,
      setupType: alert.setupType,
      side: alert.side,
      status: 'PENDING_ENTRY',
      submittedAt: alert.detectedAt,
      expiresAt,
      entry: round(alert.candidate.entry, 4),
      stopLoss: round(alert.candidate.stopLoss, 4),
      takeProfit: round(alert.candidate.takeProfit[0] ?? alert.candidate.entry, 4),
      quantity: derivedQuantity,
      riskPct: derivedRiskPct,
      riskAmount,
      source,
      autonomyThesis:
        typeof alert.candidate.metadata.autonomyThesis === 'string' ? alert.candidate.metadata.autonomyThesis : undefined,
      autonomyReason:
        typeof alert.candidate.metadata.autonomyReason === 'string' ? alert.candidate.metadata.autonomyReason : undefined,
      researchDirection:
        typeof alert.candidate.metadata.researchDirection === 'string' ? alert.candidate.metadata.researchDirection : undefined
    };

    this.trades.set(alert.alertId, trade);
    this.lastUpdatedAt = alert.detectedAt;
    this.pushEquityPoint(alert.detectedAt);
    await this.persist();
    return trade;
  }

  async ingestBars(rawBars: OneMinuteBar[]): Promise<{ accepted: number; settled: number }> {
    if (!this.config.enabled || rawBars.length === 0) {
      return { accepted: 0, settled: 0 };
    }
    await this.start();

    let settled = 0;
    const pendingEvents: PaperTradeEvent[] = [];
    const bars = [...rawBars].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    for (const bar of bars) {
      if (bar.symbol !== 'NQ' && bar.symbol !== 'ES') {
        continue;
      }
      if (!isCmeEquitySessionOpen(bar.timestamp)) {
        continue;
      }
      this.latestPriceBySymbol.set(bar.symbol, bar.close);
      const symbolTrades = [...this.trades.values()].filter(
        (trade) =>
          trade.symbol === bar.symbol
          && (trade.status === 'PENDING_ENTRY' || trade.status === 'OPEN')
          && Date.parse(bar.timestamp) > Date.parse(trade.submittedAt)
      );
      for (const trade of symbolTrades) {
        const updated = this.evaluateOpenTradeAgainstBar(trade, bar);
        if (updated !== trade) {
          this.trades.set(trade.alertId, updated);
          this.lastUpdatedAt = bar.timestamp;
          if (trade.status === 'PENDING_ENTRY' && updated.status === 'OPEN') {
            pendingEvents.push({
              kind: 'TRADE_OPENED',
              at: bar.timestamp,
              trade: updated,
              equityPoint: this.pushEquityPoint(bar.timestamp)
            });
          }
          if (updated.status === 'CLOSED' || updated.status === 'CANCELED') {
            settled += 1;
            if (updated.status === 'CLOSED') {
              pendingEvents.push({
                kind: 'TRADE_CLOSED',
                at: bar.timestamp,
                trade: updated,
                equityPoint: this.pushEquityPoint(bar.timestamp)
              });
            }
          }
        }
      }
    }

    if (settled > 0 || bars.length > 0) {
      await this.persist();
    }

    for (const event of pendingEvents) {
      await this.config.onTradeEvent?.(event);
    }

    return { accepted: bars.length, settled };
  }

  async reconcileMarketSession(now = new Date().toISOString()): Promise<{ closed: number; canceled: number }> {
    if (!this.config.enabled) {
      return { closed: 0, canceled: 0 };
    }
    await this.start();

    if (isCmeEquitySessionOpen(now)) {
      return { closed: 0, canceled: 0 };
    }

    let closed = 0;
    let canceled = 0;
    const pendingEvents: PaperTradeEvent[] = [];
    for (const trade of this.listTrades()) {
      if (trade.status !== 'PENDING_ENTRY' && trade.status !== 'OPEN') {
        continue;
      }

      const nextTrade =
        trade.status === 'PENDING_ENTRY'
          ? this.closeTrade(trade, now, trade.entry, 'ENTRY_EXPIRED')
          : this.closeTrade(
              trade,
              now,
              this.latestPriceBySymbol.get(trade.symbol) ?? trade.filledPrice ?? trade.entry,
              'TIME_EXIT'
            );

      this.trades.set(trade.alertId, nextTrade);
      this.lastUpdatedAt = now;
      if (nextTrade.status === 'CANCELED') {
        canceled += 1;
        continue;
      }

      closed += 1;
      pendingEvents.push({
        kind: 'TRADE_CLOSED',
        at: now,
        trade: nextTrade,
        equityPoint: this.pushEquityPoint(now)
      });
    }

    if (closed > 0 || canceled > 0) {
      this.pushEquityPoint(now);
      await this.persist();
    }

    for (const event of pendingEvents) {
      await this.config.onTradeEvent?.(event);
    }

    return { closed, canceled };
  }

  private buildAccountSnapshot(now: string): AccountSnapshot {
    const equity = round(this.balance + [...this.trades.values()].reduce((sum, trade) => sum + this.getTradeUnrealizedPnl(trade), 0), 2);
    const localNow = getLocalTimeParts(now, this.config.timezone);
    const sessionMinute =
      this.autonomyMode === 'UNRESTRICTED'
        ? 0
        : this.config.sessionStartHour * 60 + this.config.sessionStartMinute;

    const closedTrades = [...this.trades.values()]
      .filter((trade) => trade.status === 'CLOSED')
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
    let consecutiveLosses = 0;
    for (const trade of closedTrades) {
      if ((trade.realizedPnl ?? 0) < 0) {
        consecutiveLosses += 1;
        continue;
      }
      break;
    }

    const dayTrades = closedTrades.filter((trade) => trade.closedAt && getLocalTimeParts(trade.closedAt, this.config.timezone).dayKey === localNow.dayKey);
    const dayClosedPnl = dayTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
    const dayStartBalance = this.balance - dayClosedPnl;

    const sessionTrades = dayTrades.filter((trade) => {
      if (!trade.closedAt) {
        return false;
      }
      return getLocalTimeParts(trade.closedAt, this.config.timezone).minuteOfDay >= sessionMinute;
    });
    const sessionClosedPnl = sessionTrades.reduce((sum, trade) => sum + (trade.realizedPnl ?? 0), 0);
    const sessionStartBalance = this.balance - sessionClosedPnl;

    return {
      equity,
      dailyLossPct: dayClosedPnl < 0 ? round((Math.abs(dayClosedPnl) / Math.max(dayStartBalance, 1)) * 100, 2) : 0,
      sessionLossPct:
        sessionClosedPnl < 0 ? round((Math.abs(sessionClosedPnl) / Math.max(sessionStartBalance, 1)) * 100, 2) : 0,
      consecutiveLosses
    };
  }

  status(now = new Date().toISOString()): PaperTradingStatus {
    const trades = this.listTrades();
    const openTrades = trades.filter((trade) => trade.status === 'OPEN');
    const pendingEntries = trades.filter((trade) => trade.status === 'PENDING_ENTRY');
    const closedTrades = trades.filter((trade) => trade.status === 'CLOSED');
    const canceledTrades = trades.filter((trade) => trade.status === 'CANCELED');
    const { realizedPnl, unrealizedPnl, equity } = this.computeEquityBreakdown();
    const wins = closedTrades.filter((trade) => (trade.realizedPnl ?? 0) > 0).length;
    const losses = closedTrades.filter((trade) => (trade.realizedPnl ?? 0) < 0).length;

    return {
      enabled: this.config.enabled,
      started: this.started,
      statePath: this.config.statePath,
      initialBalance: round(this.config.initialBalance, 2),
      maxConcurrentTrades: this.maxConcurrentTrades,
      autonomyMode: this.autonomyMode,
      autonomyRiskPct: this.autonomyRiskPct,
      balance: round(this.balance, 2),
      equity,
      realizedPnl,
      unrealizedPnl,
      openTrades: openTrades.length,
      pendingEntries: pendingEntries.length,
      closedTrades: closedTrades.length,
      canceledTrades: canceledTrades.length,
      winningTrades: wins,
      losingTrades: losses,
      hitRate: closedTrades.length > 0 ? round(wins / closedTrades.length, 2) : 0,
      lastUpdatedAt: this.lastUpdatedAt,
      accountSnapshot: this.buildAccountSnapshot(now),
      equityHistory: this.equityHistory.slice(-this.config.maxEquityHistory),
      recentOpenTrades: [...pendingEntries, ...openTrades]
        .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
        .slice(0, MAX_RECENT_TRADES),
      recentClosedTrades: [...closedTrades, ...canceledTrades]
        .sort((a, b) => (b.closedAt ?? b.submittedAt).localeCompare(a.closedAt ?? a.submittedAt))
        .slice(0, this.config.maxClosedTrades)
    };
  }

  getRiskAccountSnapshot(now: string): AccountSnapshot {
    return this.status(now).accountSnapshot;
  }

  async reset(now = new Date().toISOString()): Promise<PaperTradingStatus> {
    await this.start();
    this.balance = round(this.config.initialBalance, 2);
    this.trades.clear();
    this.latestPriceBySymbol.clear();
    this.equityHistory = [];
    this.lastUpdatedAt = now;
    this.pushEquityPoint(now);
    await this.persist();
    return this.status(now);
  }

  async updateConfig(
    next: Partial<Pick<PaperTradingConfig, 'maxConcurrentTrades' | 'autonomyMode' | 'autonomyRiskPct'>>
  ): Promise<PaperTradingStatus> {
    await this.start();
    if (next.autonomyMode === 'FOLLOW_ALLOWED_ALERTS' || next.autonomyMode === 'UNRESTRICTED') {
      this.autonomyMode = next.autonomyMode;
    }
    if (typeof next.maxConcurrentTrades === 'number' && Number.isFinite(next.maxConcurrentTrades)) {
      this.maxConcurrentTrades = normalizeConcurrentTradeCap(next.maxConcurrentTrades);
    }
    if (this.autonomyMode === 'UNRESTRICTED') {
      this.maxConcurrentTrades = 0;
    }
    if (typeof next.autonomyRiskPct === 'number' && Number.isFinite(next.autonomyRiskPct)) {
      this.autonomyRiskPct = normalizeAutonomyRiskPct(next.autonomyRiskPct);
    }
    await this.persist();
    return this.status();
  }
}
