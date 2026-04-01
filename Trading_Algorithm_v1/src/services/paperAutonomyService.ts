import fs from 'node:fs/promises';
import path from 'node:path';
import type { Candle, SetupCandidate, SignalAlert, SignalChartSnapshot, Side, SymbolCode } from '../domain/types.js';
import { aggregateBars, parseOneMinuteCsv, type OneMinuteBar } from '../training/historicalTrainer.js';
import type { MarketResearchStatus, ResearchTrendDirection } from './marketResearchService.js';
import type { PaperTrade, PaperTradeEvent } from './paperTradingService.js';

export type PaperAutonomyThesis = 'TREND_BREAKOUT_EXPANSION' | 'TREND_PULLBACK_RECLAIM';

interface LocalTimeParts {
  dayKey: string;
  minuteOfDay: number;
}

export interface PaperAutonomyIdeaRecord {
  alertId: string;
  candidateId: string;
  symbol: SymbolCode;
  side: Side;
  thesis: PaperAutonomyThesis;
  score: number;
  reason: string;
  researchDirection: ResearchTrendDirection;
  researchConfidence: number;
  openedAt: string;
  status: 'OPEN' | 'CLOSED';
  paperTradeId?: string;
  closedAt?: string;
  realizedPnl?: number;
  realizedR?: number;
  outcome?: 'WIN' | 'LOSS' | 'FLAT';
}

export interface PaperAutonomyThesisStats {
  thesis: PaperAutonomyThesis;
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  flats: number;
  hitRate: number;
  avgR: number;
}

export interface PaperAutonomyStatus {
  enabled: boolean;
  started: boolean;
  statePath?: string;
  lastIdeaAt?: string;
  lastEvaluatedAt?: string;
  lastError?: string;
  focusSymbols: SymbolCode[];
  session: {
    timezone: string;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
  totalIdeas: number;
  openIdeas: number;
  closedIdeas: number;
  winRate: number;
  thesisStats: PaperAutonomyThesisStats[];
  recentIdeas: PaperAutonomyIdeaRecord[];
}

interface PersistedPaperAutonomyState {
  ideas: PaperAutonomyIdeaRecord[];
}

export interface PaperAutonomyConfig {
  enabled: boolean;
  statePath?: string;
  archivePath?: string;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  timezone: string;
  sessionStartHour: number;
  sessionStartMinute: number;
  sessionEndHour: number;
  sessionEndMinute: number;
  focusSymbols: SymbolCode[];
  maxBarsPerSymbol: number;
  maxIdeas: number;
  maxHoldMinutes: number;
  minTrendConfidence: number;
  breakoutLookbackBars5m: number;
  pullbackLookbackBars5m: number;
  getMarketResearchStatus?: () => MarketResearchStatus | null;
  submitAlert: (alert: SignalAlert, source: string) => Promise<PaperTrade | null>;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const getFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = dtfCache.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  dtfCache.set(timezone, formatter);
  return formatter;
};

const getLocalTimeParts = (timestamp: string, timezone: string): LocalTimeParts => {
  const formatter = getFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestamp));
  const find = (type: Intl.DateTimeFormatPartTypes): string => parts.find((entry) => entry.type === type)?.value ?? '00';
  const year = find('year');
  const month = find('month');
  const day = find('day');
  const hour = Number.parseInt(find('hour'), 10);
  const minute = Number.parseInt(find('minute'), 10);
  return {
    dayKey: `${year}-${month}-${day}`,
    minuteOfDay: hour * 60 + minute
  };
};

const inWindow = (minuteOfDay: number, start: number, end: number): boolean =>
  minuteOfDay >= start && minuteOfDay <= end;

const takeLast = <T>(items: T[], count: number): T[] =>
  items.length <= count ? items : items.slice(items.length - count);

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const isIntervalClosed = (timestamp: string, intervalMinutes: number): boolean => {
  const date = new Date(timestamp);
  return ((date.getUTCMinutes() + 1) % intervalMinutes) === 0;
};

const completeCandles = (
  bars: OneMinuteBar[],
  nowTimestamp: string,
  intervalMinutes: number,
  tailCount: number
): Candle[] => {
  let candles = aggregateBars(bars, intervalMinutes);
  if (!isIntervalClosed(nowTimestamp, intervalMinutes) && candles.length > 0) {
    candles = candles.slice(0, -1);
  }
  return takeLast(candles, tailCount);
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const calcEma = (values: number[], period: number): number[] => {
  if (values.length === 0) {
    return [];
  }
  const multiplier = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    result.push(values[index] * multiplier + result[index - 1] * (1 - multiplier));
  }
  return result;
};

const calcAtr = (candles: Candle[], period: number): number => {
  if (candles.length < 2) {
    return 0;
  }
  const relevant = takeLast(candles, period + 1);
  const trs = [];
  for (let index = 1; index < relevant.length; index += 1) {
    const current = relevant[index];
    const prev = relevant[index - 1];
    trs.push(
      Math.max(
        current.high - current.low,
        Math.abs(current.high - prev.close),
        Math.abs(current.low - prev.close)
      )
    );
  }
  return average(trs);
};

const thesisLabel = (thesis: PaperAutonomyThesis): string =>
  thesis === 'TREND_BREAKOUT_EXPANSION' ? 'Trend Breakout Expansion' : 'Trend Pullback Reclaim';

const summarizeCandidate = (candidate: SetupCandidate): string => {
  const score = typeof candidate.finalScore === 'number' ? `score ${candidate.finalScore.toFixed(1)}` : 'unscored';
  return `${candidate.symbol} ${candidate.side} • ${candidate.setupType} • ${score}`;
};

const normalizeIdea = (value: unknown): PaperAutonomyIdeaRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<PaperAutonomyIdeaRecord>;
  if (
    typeof candidate.alertId !== 'string'
    || typeof candidate.candidateId !== 'string'
    || (candidate.symbol !== 'NQ' && candidate.symbol !== 'ES')
    || (candidate.side !== 'LONG' && candidate.side !== 'SHORT')
    || (candidate.thesis !== 'TREND_BREAKOUT_EXPANSION' && candidate.thesis !== 'TREND_PULLBACK_RECLAIM')
    || typeof candidate.score !== 'number'
    || typeof candidate.reason !== 'string'
    || typeof candidate.researchDirection !== 'string'
    || typeof candidate.researchConfidence !== 'number'
    || typeof candidate.openedAt !== 'string'
    || (candidate.status !== 'OPEN' && candidate.status !== 'CLOSED')
  ) {
    return null;
  }
  return {
    alertId: candidate.alertId,
    candidateId: candidate.candidateId,
    symbol: candidate.symbol,
    side: candidate.side,
    thesis: candidate.thesis,
    score: round(candidate.score, 2),
    reason: candidate.reason,
    researchDirection: candidate.researchDirection as ResearchTrendDirection,
    researchConfidence: round(candidate.researchConfidence, 2),
    openedAt: candidate.openedAt,
    status: candidate.status,
    paperTradeId: typeof candidate.paperTradeId === 'string' ? candidate.paperTradeId : undefined,
    closedAt: typeof candidate.closedAt === 'string' ? candidate.closedAt : undefined,
    realizedPnl: typeof candidate.realizedPnl === 'number' ? round(candidate.realizedPnl, 2) : undefined,
    realizedR: typeof candidate.realizedR === 'number' ? round(candidate.realizedR, 2) : undefined,
    outcome: candidate.outcome === 'WIN' || candidate.outcome === 'LOSS' || candidate.outcome === 'FLAT' ? candidate.outcome : undefined
  };
};

const listCsvFiles = async (dirPath: string, recursive: boolean): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const nextPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return recursive ? listCsvFiles(nextPath, recursive) : [];
      }
      return entry.isFile() && nextPath.endsWith('.csv') ? [nextPath] : [];
    })
  );
  return files.flat();
};

export class PaperAutonomyService {
  private started = false;
  private lastError: string | undefined;
  private lastIdeaAt: string | undefined;
  private lastEvaluatedAt: string | undefined;
  private barsBySymbol = new Map<SymbolCode, OneMinuteBar[]>();
  private barKeys = new Set<string>();
  private ideas = new Map<string, PaperAutonomyIdeaRecord>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly config: PaperAutonomyConfig) {}

  private async loadState(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }
    try {
      const raw = await fs.readFile(this.config.statePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedPaperAutonomyState>;
      this.ideas = new Map(
        (Array.isArray(parsed.ideas) ? parsed.ideas : [])
          .map((idea) => normalizeIdea(idea))
          .filter((idea): idea is PaperAutonomyIdeaRecord => idea !== null)
          .map((idea) => [idea.alertId, idea])
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.lastError = err.message;
      }
      this.ideas.clear();
    }
  }

  private async persistState(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }
    const snapshot: PersistedPaperAutonomyState = {
      ideas: [...this.ideas.values()]
        .sort((left, right) => left.openedAt.localeCompare(right.openedAt))
        .slice(-this.config.maxIdeas)
    };
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.config.statePath as string), { recursive: true });
      await fs.writeFile(this.config.statePath as string, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    });
    await this.writeChain;
  }

  private mergeBars(bars: OneMinuteBar[]): void {
    for (const bar of bars) {
      if (!this.config.focusSymbols.includes(bar.symbol)) {
        continue;
      }
      const key = `${bar.symbol}|${bar.timestamp}`;
      if (this.barKeys.has(key)) {
        continue;
      }
      this.barKeys.add(key);
      const existing = this.barsBySymbol.get(bar.symbol) ?? [];
      existing.push(bar);
      existing.sort((left, right) => left.timestamp.localeCompare(right.timestamp));
      while (existing.length > this.config.maxBarsPerSymbol) {
        const removed = existing.shift();
        if (removed) {
          this.barKeys.delete(`${removed.symbol}|${removed.timestamp}`);
        }
      }
      this.barsBySymbol.set(bar.symbol, existing);
    }
  }

  private async loadArchiveBars(): Promise<void> {
    if (!this.config.archivePath) {
      return;
    }
    const exists = await fs.stat(this.config.archivePath).then((stats) => stats.isFile()).catch(() => false);
    if (!exists) {
      return;
    }
    const raw = await fs.readFile(this.config.archivePath, 'utf8');
    const bars: OneMinuteBar[] = [];
    for (const line of raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
      try {
        bars.push(JSON.parse(line) as OneMinuteBar);
      } catch {
        // Ignore malformed rows.
      }
    }
    this.mergeBars(bars);
  }

  private async loadBootstrapCsv(): Promise<void> {
    if (!this.config.bootstrapCsvDir) {
      return;
    }
    const exists = await fs.stat(this.config.bootstrapCsvDir).then((stats) => stats.isDirectory()).catch(() => false);
    if (!exists) {
      return;
    }
    const files = await listCsvFiles(this.config.bootstrapCsvDir, this.config.bootstrapRecursive);
    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8');
      this.mergeBars(parseOneMinuteCsv(raw));
    }
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.started) {
      return;
    }
    this.started = true;
    try {
      await this.loadState();
      await this.loadArchiveBars();
      await this.loadBootstrapCsv();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = (error as Error).message;
    }
  }

  stop(): void {
    this.started = false;
  }

  private buildSessionExpiry(timestamp: string): string {
    const local = getLocalTimeParts(timestamp, this.config.timezone);
    const sessionEndMinute = this.config.sessionEndHour * 60 + this.config.sessionEndMinute;
    const remainingMinutes = Math.max(1, sessionEndMinute - local.minuteOfDay);
    const holdMinutes = Math.min(this.config.maxHoldMinutes, remainingMinutes);
    return new Date(Date.parse(timestamp) + holdMinutes * 60_000).toISOString();
  }

  private buildThesisBias(thesis: PaperAutonomyThesis, symbol: SymbolCode): number {
    const evaluated = [...this.ideas.values()].filter(
      (idea) => idea.thesis === thesis && idea.symbol === symbol && idea.status === 'CLOSED' && idea.outcome
    );
    if (evaluated.length < 3) {
      return 0;
    }
    const wins = evaluated.filter((idea) => idea.outcome === 'WIN').length;
    const hitRate = wins / evaluated.length;
    return clamp((hitRate - 0.5) * 18, -6, 6);
  }

  private buildChartSnapshot(candles5m: Candle[], candidate: SetupCandidate): SignalChartSnapshot | undefined {
    const bars = takeLast(candles5m, 18);
    if (bars.length < 4) {
      return undefined;
    }
    return {
      timeframe: '5m',
      bars,
      generatedAt: candidate.generatedAt,
      detectedAt: candidate.generatedAt,
      focusBarAt: bars[bars.length - 1]?.timestamp ?? candidate.generatedAt,
      symbol: candidate.symbol,
      side: candidate.side,
      setupType: candidate.setupType,
      levels: {
        entry: candidate.entry,
        stopLoss: candidate.stopLoss,
        takeProfit: candidate.takeProfit[0]
      },
      referenceLevels: [
        { key: 'entry', label: 'Entry', price: candidate.entry, role: 'trade', onChart: true },
        { key: 'stopLoss', label: 'Stop', price: candidate.stopLoss, role: 'trade', onChart: true },
        { key: 'takeProfit', label: 'TP1', price: candidate.takeProfit[0], role: 'trade', onChart: true }
      ]
    };
  }

  private buildAlertId(symbol: SymbolCode, thesis: PaperAutonomyThesis, timestamp: string): string {
    return `paper-autonomy:${symbol}|${thesis}|${timestamp}`;
  }

  private resolveResearchDirection(
    symbol: SymbolCode,
    candles5m: Candle[],
    candles15m: Candle[],
    candles1H: Candle[]
  ): { direction: ResearchTrendDirection; confidence: number; reason: string } {
    const researchStatus = this.config.getMarketResearchStatus?.() ?? null;
    const symbolTrend = researchStatus?.symbols.find((status) => status.symbol === symbol);
    if (symbolTrend && symbolTrend.confidence >= this.config.minTrendConfidence) {
      return {
        direction: symbolTrend.direction,
        confidence: symbolTrend.confidence,
        reason: symbolTrend.reason
      };
    }

    const close5m = candles5m.map((candle) => candle.close);
    const close15m = candles15m.map((candle) => candle.close);
    const close1H = candles1H.map((candle) => candle.close);
    if (close5m.length < 10 || close15m.length < 6 || close1H.length < 4) {
      return {
        direction: 'STAND_ASIDE',
        confidence: 0,
        reason: 'Not enough bars to build an autonomous trend.'
      };
    }

    const emaFast5 = calcEma(close5m, 9).at(-1) ?? close5m.at(-1) ?? 0;
    const emaSlow5 = calcEma(close5m, 20).at(-1) ?? close5m.at(-1) ?? 0;
    const ema15 = calcEma(close15m, 10).at(-1) ?? close15m.at(-1) ?? 0;
    const ema1H = calcEma(close1H, 6).at(-1) ?? close1H.at(-1) ?? 0;
    const lastClose = close5m.at(-1) ?? 0;

    const bullishVotes =
      Number(lastClose > emaFast5) + Number(emaFast5 > emaSlow5) + Number(close15m.at(-1)! > ema15) + Number(close1H.at(-1)! > ema1H);
    const bearishVotes =
      Number(lastClose < emaFast5) + Number(emaFast5 < emaSlow5) + Number(close15m.at(-1)! < ema15) + Number(close1H.at(-1)! < ema1H);

    if (bullishVotes >= 3 && bullishVotes > bearishVotes) {
      return {
        direction: 'BULLISH',
        confidence: round(clamp(0.45 + bullishVotes * 0.1, 0, 0.82), 2),
        reason: 'Autonomous bar-state trend is bullish across 5m, 15m, and 1H structure.'
      };
    }
    if (bearishVotes >= 3 && bearishVotes > bullishVotes) {
      return {
        direction: 'BEARISH',
        confidence: round(clamp(0.45 + bearishVotes * 0.1, 0, 0.82), 2),
        reason: 'Autonomous bar-state trend is bearish across 5m, 15m, and 1H structure.'
      };
    }
    return {
      direction: 'BALANCED',
      confidence: 0.4,
      reason: 'Autonomous bar-state trend is balanced.'
    };
  }

  private buildBreakoutIdea(
    symbol: SymbolCode,
    candles5m: Candle[],
    direction: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>,
    confidence: number
  ): {
    thesis: PaperAutonomyThesis;
    side: Side;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    score: number;
    reason: string;
  } | null {
    const current = candles5m.at(-1);
    if (!current) {
      return null;
    }
    const prev = candles5m.slice(-(this.config.breakoutLookbackBars5m + 1), -1);
    if (prev.length < this.config.breakoutLookbackBars5m) {
      return null;
    }
    const closes = candles5m.map((candle) => candle.close);
    const ema20 = calcEma(closes, 20).at(-1) ?? current.close;
    const atr = calcAtr(candles5m, 14);
    if (atr <= 0) {
      return null;
    }
    const priorHigh = Math.max(...prev.map((candle) => candle.high));
    const priorLow = Math.min(...prev.map((candle) => candle.low));
    if (direction === 'BULLISH') {
      if (current.close <= priorHigh || current.close <= current.open || current.close <= ema20) {
        return null;
      }
      const stopLoss = round(Math.min(...takeLast(candles5m, 3).map((candle) => candle.low)) - atr * 0.2, 2);
      if (stopLoss >= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const risk = entry - stopLoss;
      const takeProfit = round(entry + risk * clamp(1.8 + confidence, 1.8, 2.6), 2);
      const score = round(clamp(62 + confidence * 20 + this.buildThesisBias('TREND_BREAKOUT_EXPANSION', symbol), 0, 100), 2);
      return {
        thesis: 'TREND_BREAKOUT_EXPANSION',
        side: 'LONG',
        entry,
        stopLoss,
        takeProfit,
        score,
        reason: `Autonomous breakout: 5m closed above prior ${this.config.breakoutLookbackBars5m}-bar high with bullish trend backing it.`
      };
    }

    if (current.close >= priorLow || current.close >= current.open || current.close >= ema20) {
      return null;
    }
    const stopLoss = round(Math.max(...takeLast(candles5m, 3).map((candle) => candle.high)) + atr * 0.2, 2);
    if (stopLoss <= current.close) {
      return null;
    }
    const entry = round(current.close, 2);
    const risk = stopLoss - entry;
    const takeProfit = round(entry - risk * clamp(1.8 + confidence, 1.8, 2.6), 2);
    const score = round(clamp(62 + confidence * 20 + this.buildThesisBias('TREND_BREAKOUT_EXPANSION', symbol), 0, 100), 2);
    return {
      thesis: 'TREND_BREAKOUT_EXPANSION',
      side: 'SHORT',
      entry,
      stopLoss,
      takeProfit,
      score,
      reason: `Autonomous breakout: 5m closed below prior ${this.config.breakoutLookbackBars5m}-bar low with bearish trend backing it.`
    };
  }

  private buildPullbackIdea(
    symbol: SymbolCode,
    candles5m: Candle[],
    direction: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>,
    confidence: number
  ): {
    thesis: PaperAutonomyThesis;
    side: Side;
    entry: number;
    stopLoss: number;
    takeProfit: number;
    score: number;
    reason: string;
  } | null {
    if (candles5m.length < Math.max(12, this.config.pullbackLookbackBars5m + 3)) {
      return null;
    }
    const current = candles5m.at(-1);
    const previous = candles5m.at(-2);
    if (!current || !previous) {
      return null;
    }
    const closes = candles5m.map((candle) => candle.close);
    const ema9Series = calcEma(closes, 9);
    const ema20Series = calcEma(closes, 20);
    const ema9 = ema9Series.at(-1) ?? current.close;
    const ema20 = ema20Series.at(-1) ?? current.close;
    const atr = calcAtr(candles5m, 14);
    if (atr <= 0) {
      return null;
    }
    const recent = takeLast(candles5m, this.config.pullbackLookbackBars5m + 1);

    if (direction === 'BULLISH') {
      const touchedPullback = recent.slice(0, -1).some((candle) => candle.low <= ema20 + atr * 0.12);
      if (!touchedPullback || ema9 <= ema20 || current.close <= previous.high || current.close <= current.open) {
        return null;
      }
      const stopLoss = round(Math.min(...recent.map((candle) => candle.low)) - atr * 0.18, 2);
      if (stopLoss >= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const risk = entry - stopLoss;
      const takeProfit = round(entry + risk * clamp(1.7 + confidence, 1.7, 2.4), 2);
      const score = round(clamp(60 + confidence * 18 + this.buildThesisBias('TREND_PULLBACK_RECLAIM', symbol), 0, 100), 2);
      return {
        thesis: 'TREND_PULLBACK_RECLAIM',
        side: 'LONG',
        entry,
        stopLoss,
        takeProfit,
        score,
        reason: 'Autonomous pullback reclaim: 5m trend held the pullback and reclaimed momentum.'
      };
    }

    const touchedPullback = recent.slice(0, -1).some((candle) => candle.high >= ema20 - atr * 0.12);
    if (!touchedPullback || ema9 >= ema20 || current.close >= previous.low || current.close >= current.open) {
      return null;
    }
    const stopLoss = round(Math.max(...recent.map((candle) => candle.high)) + atr * 0.18, 2);
    if (stopLoss <= current.close) {
      return null;
    }
    const entry = round(current.close, 2);
    const risk = stopLoss - entry;
    const takeProfit = round(entry - risk * clamp(1.7 + confidence, 1.7, 2.4), 2);
    const score = round(clamp(60 + confidence * 18 + this.buildThesisBias('TREND_PULLBACK_RECLAIM', symbol), 0, 100), 2);
    return {
      thesis: 'TREND_PULLBACK_RECLAIM',
      side: 'SHORT',
      entry,
      stopLoss,
      takeProfit,
      score,
      reason: 'Autonomous pullback reclaim: 5m downtrend rejected the pullback and resumed lower.'
    };
  }

  private async evaluateSymbol(symbol: SymbolCode, timestamp: string): Promise<void> {
    const bars = this.barsBySymbol.get(symbol) ?? [];
    const currentIndex = bars.findIndex((bar) => bar.timestamp === timestamp);
    if (currentIndex < 0) {
      return;
    }
    const currentBar = bars[currentIndex];
    if (!isIntervalClosed(currentBar.timestamp, 5)) {
      return;
    }

    const localNow = getLocalTimeParts(currentBar.timestamp, this.config.timezone);
    const sessionStart = this.config.sessionStartHour * 60 + this.config.sessionStartMinute;
    const sessionEnd = this.config.sessionEndHour * 60 + this.config.sessionEndMinute;
    if (!inWindow(localNow.minuteOfDay, sessionStart, sessionEnd)) {
      return;
    }

    const barsUntilNow = bars.slice(0, currentIndex + 1);
    const candles5m = completeCandles(barsUntilNow, currentBar.timestamp, 5, 30);
    const candles15m = completeCandles(barsUntilNow, currentBar.timestamp, 15, 20);
    const candles1H = completeCandles(barsUntilNow, currentBar.timestamp, 60, 12);
    if (candles5m.length < 12 || candles15m.length < 6 || candles1H.length < 4) {
      return;
    }

    const trend = this.resolveResearchDirection(symbol, candles5m, candles15m, candles1H);
    if (trend.direction !== 'BULLISH' && trend.direction !== 'BEARISH') {
      return;
    }
    if (trend.confidence < this.config.minTrendConfidence) {
      return;
    }

    const ideas = [
      this.buildBreakoutIdea(symbol, candles5m, trend.direction, trend.confidence),
      this.buildPullbackIdea(symbol, candles5m, trend.direction, trend.confidence)
    ].filter((idea): idea is NonNullable<typeof idea> => Boolean(idea));

    const bestIdea = ideas.sort((left, right) => right.score - left.score)[0];
    if (!bestIdea) {
      return;
    }

    const alertId = this.buildAlertId(symbol, bestIdea.thesis, currentBar.timestamp);
    if (this.ideas.has(alertId)) {
      return;
    }

    const candidate: SetupCandidate = {
      id: `paper-autonomy-candidate:${symbol}|${bestIdea.thesis}|${currentBar.timestamp}`,
      setupType: 'AUTONOMOUS_FUTURES_DAYTRADER',
      symbol,
      session: 'NY',
      detectionTimeframe: '5m',
      executionTimeframe: '5m',
      side: bestIdea.side,
      entry: bestIdea.entry,
      stopLoss: bestIdea.stopLoss,
      takeProfit: [bestIdea.takeProfit],
      baseScore: bestIdea.score,
      oneMinuteConfidence: trend.confidence,
      finalScore: bestIdea.score,
      eligibility: {
        passed: true,
        passReasons: ['AUTONOMOUS_PAPER_RESEARCH_ENGINE'],
        failReasons: []
      },
      metadata: {
        autonomyThesis: bestIdea.thesis,
        autonomyReason: bestIdea.reason,
        researchDirection: trend.direction,
        researchConfidence: trend.confidence,
        independentPaperEngine: true,
        paperTradeExpiresAt: this.buildSessionExpiry(currentBar.timestamp)
      },
      generatedAt: currentBar.timestamp
    };

    const alert: SignalAlert = {
      alertId,
      symbol,
      setupType: candidate.setupType,
      side: candidate.side,
      detectedAt: currentBar.timestamp,
      rankingModelId: 'paper-autonomy-engine',
      title: `${symbol} ${candidate.side} autonomous futures idea`,
      summary: summarizeCandidate(candidate),
      candidate,
      riskDecision: {
        allowed: true,
        finalRiskPct: 0,
        positionSize: 0,
        reasonCodes: ['PAPER_AUTONOMY_SELF_DIRECTED'],
        blockedByNewsWindow: false,
        blockedByTradingWindow: false,
        blockedByPolicy: false,
        checkedAt: currentBar.timestamp
      },
      chartSnapshot: this.buildChartSnapshot(candles5m, candidate)
    };

    const trade = await this.config.submitAlert(alert, 'paper-autonomy');
    if (!trade) {
      return;
    }

    this.ideas.set(alertId, {
      alertId,
      candidateId: candidate.id,
      symbol,
      side: candidate.side,
      thesis: bestIdea.thesis,
      score: bestIdea.score,
      reason: bestIdea.reason,
      researchDirection: trend.direction,
      researchConfidence: trend.confidence,
      openedAt: currentBar.timestamp,
      status: 'OPEN',
      paperTradeId: trade.paperTradeId
    });
    this.lastIdeaAt = currentBar.timestamp;
    this.lastEvaluatedAt = currentBar.timestamp;
    await this.persistState();
  }

  async ingestBars(rawBars: OneMinuteBar[]): Promise<{ accepted: number; ideasOpened: number }> {
    if (!this.config.enabled || rawBars.length === 0) {
      return { accepted: 0, ideasOpened: 0 };
    }
    await this.start();

    const beforeKeys = this.barKeys.size;
    const beforeIdeas = this.ideas.size;
    const sorted = [...rawBars].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    this.mergeBars(sorted);
    for (const bar of sorted) {
      if (!this.config.focusSymbols.includes(bar.symbol)) {
        continue;
      }
      await this.evaluateSymbol(bar.symbol, bar.timestamp);
    }
    return {
      accepted: this.barKeys.size - beforeKeys,
      ideasOpened: this.ideas.size - beforeIdeas
    };
  }

  async recordTradeOutcome(event: PaperTradeEvent): Promise<void> {
    if (event.trade.source !== 'paper-autonomy') {
      return;
    }
    const idea = this.ideas.get(event.trade.alertId);
    if (!idea || event.kind !== 'TRADE_CLOSED' || idea.status === 'CLOSED') {
      return;
    }
    const outcome =
      event.trade.exitReason === 'TAKE_PROFIT'
        ? 'WIN'
        : event.trade.exitReason === 'STOP_LOSS'
          ? 'LOSS'
          : (event.trade.realizedPnl ?? 0) > 0
            ? 'WIN'
            : (event.trade.realizedPnl ?? 0) < 0
              ? 'LOSS'
              : 'FLAT';
    this.ideas.set(event.trade.alertId, {
      ...idea,
      status: 'CLOSED',
      closedAt: event.at,
      realizedPnl: round(event.trade.realizedPnl ?? 0, 2),
      realizedR: typeof event.trade.realizedR === 'number' ? round(event.trade.realizedR, 2) : undefined,
      outcome
    });
    await this.persistState();
  }

  status(): PaperAutonomyStatus {
    const ideas = [...this.ideas.values()].sort((left, right) => right.openedAt.localeCompare(left.openedAt));
    const openIdeas = ideas.filter((idea) => idea.status === 'OPEN');
    const closedIdeas = ideas.filter((idea) => idea.status === 'CLOSED');
    const wins = closedIdeas.filter((idea) => idea.outcome === 'WIN').length;
    const thesisStats: PaperAutonomyThesisStats[] = (['TREND_BREAKOUT_EXPANSION', 'TREND_PULLBACK_RECLAIM'] as PaperAutonomyThesis[])
      .map((thesis) => {
        const thesisIdeas = ideas.filter((idea) => idea.thesis === thesis);
        const thesisClosed = thesisIdeas.filter((idea) => idea.status === 'CLOSED');
        const thesisWins = thesisClosed.filter((idea) => idea.outcome === 'WIN').length;
        const thesisLosses = thesisClosed.filter((idea) => idea.outcome === 'LOSS').length;
        const thesisFlats = thesisClosed.filter((idea) => idea.outcome === 'FLAT').length;
        return {
          thesis,
          total: thesisIdeas.length,
          open: thesisIdeas.filter((idea) => idea.status === 'OPEN').length,
          closed: thesisClosed.length,
          wins: thesisWins,
          losses: thesisLosses,
          flats: thesisFlats,
          hitRate: thesisClosed.length > 0 ? round(thesisWins / thesisClosed.length, 2) : 0,
          avgR: thesisClosed.length > 0 ? round(average(thesisClosed.map((idea) => idea.realizedR ?? 0)), 2) : 0
        };
      })
      .filter((entry) => entry.total > 0);

    return {
      enabled: this.config.enabled,
      started: this.started,
      statePath: this.config.statePath,
      lastIdeaAt: this.lastIdeaAt,
      lastEvaluatedAt: this.lastEvaluatedAt,
      lastError: this.lastError,
      focusSymbols: [...this.config.focusSymbols],
      session: {
        timezone: this.config.timezone,
        startHour: this.config.sessionStartHour,
        startMinute: this.config.sessionStartMinute,
        endHour: this.config.sessionEndHour,
        endMinute: this.config.sessionEndMinute
      },
      totalIdeas: ideas.length,
      openIdeas: openIdeas.length,
      closedIdeas: closedIdeas.length,
      winRate: closedIdeas.length > 0 ? round(wins / closedIdeas.length, 2) : 0,
      thesisStats,
      recentIdeas: ideas.slice(0, 12)
    };
  }
}
