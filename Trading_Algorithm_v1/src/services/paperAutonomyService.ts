import fs from 'node:fs/promises';
import path from 'node:path';
import type { Candle, SetupCandidate, SignalAlert, SignalChartSnapshot, Side, SymbolCode } from '../domain/types.js';
import { aggregateBars, parseOneMinuteCsv, type OneMinuteBar } from '../training/historicalTrainer.js';
import { streamNdjsonValues } from '../utils/ndjson.js';
import type { MarketResearchStatus, ResearchTrendDirection } from './marketResearchService.js';
import type { PaperTrade, PaperTradeEvent, PaperTradingStatus } from './paperTradingService.js';

export type PaperAutonomyThesis =
  | 'TREND_BREAKOUT_EXPANSION'
  | 'TREND_PULLBACK_RECLAIM'
  | 'RANGE_FADE_REVERSION'
  | 'FAILED_BREAKOUT_REVERSAL'
  | 'VOLATILITY_COMPRESSION_RELEASE';

const PAPER_AUTONOMY_THESES: PaperAutonomyThesis[] = [
  'TREND_BREAKOUT_EXPANSION',
  'TREND_PULLBACK_RECLAIM',
  'RANGE_FADE_REVERSION',
  'FAILED_BREAKOUT_REVERSAL',
  'VOLATILITY_COMPRESSION_RELEASE'
];

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
  label: string;
  total: number;
  open: number;
  closed: number;
  wins: number;
  losses: number;
  flats: number;
  hitRate: number;
  avgR: number;
  realizedPnl: number;
  lastOpenedAt?: string;
}

export interface PaperAutonomySymbolStatus {
  symbol: SymbolCode;
  direction: ResearchTrendDirection;
  confidence: number;
  exploratory: boolean;
  reason: string;
  latestBarTimestamp?: string;
  openIdeas: number;
  closedIdeas: number;
  winRate: number;
  realizedPnl: number;
}

export interface PaperAutonomyPerformanceSummary {
  realizedPnl: number;
  realizedR: number;
  avgR: number;
  wins: number;
  losses: number;
  flats: number;
  learningSamples: number;
}

export interface PaperAutonomyBestThesis {
  thesis: PaperAutonomyThesis;
  label: string;
  hitRate: number;
  avgR: number;
  closed: number;
  realizedPnl: number;
}

export interface PaperAutonomyActiveThesis {
  thesis: PaperAutonomyThesis;
  label: string;
  openIdeas: number;
  totalIdeas: number;
  lastOpenedAt?: string;
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
  performance: PaperAutonomyPerformanceSummary;
  bestThesis: PaperAutonomyBestThesis | null;
  activeTheses: PaperAutonomyActiveThesis[];
  symbolStatus: PaperAutonomySymbolStatus[];
  thesisStats: PaperAutonomyThesisStats[];
  recentIdeas: PaperAutonomyIdeaRecord[];
  recentClosedIdeas: PaperAutonomyIdeaRecord[];
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
  getPaperTradingStatus?: () => PaperTradingStatus | null;
  submitAlert: (alert: SignalAlert, source: string) => Promise<PaperTrade | null>;
}

interface PaperAutonomyPortfolioAdjustment {
  scoreAdjustment: number;
  riskMultiplier: number;
  summary: string;
}

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
  thesis === 'TREND_BREAKOUT_EXPANSION'
    ? 'Trend Breakout Expansion'
    : thesis === 'TREND_PULLBACK_RECLAIM'
      ? 'Trend Pullback Reclaim'
      : thesis === 'RANGE_FADE_REVERSION'
        ? 'Range Fade Reversion'
        : thesis === 'FAILED_BREAKOUT_REVERSAL'
          ? 'Failed Breakout Reversal'
          : 'Volatility Compression Release';

const summarizeCandidate = (candidate: SetupCandidate): string => {
  const score = typeof candidate.finalScore === 'number' ? `score ${candidate.finalScore.toFixed(1)}` : 'unscored';
  return `${candidate.symbol} ${candidate.side} • ${candidate.setupType} • ${score}`;
};

const normalizeIdea = (value: unknown): PaperAutonomyIdeaRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<PaperAutonomyIdeaRecord>;
  const thesis =
    typeof candidate.thesis === 'string' && PAPER_AUTONOMY_THESES.includes(candidate.thesis as PaperAutonomyThesis)
      ? (candidate.thesis as PaperAutonomyThesis)
      : null;
  if (
    typeof candidate.alertId !== 'string'
    || typeof candidate.candidateId !== 'string'
    || (candidate.symbol !== 'NQ' && candidate.symbol !== 'ES')
    || (candidate.side !== 'LONG' && candidate.side !== 'SHORT')
    || thesis === null
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
    thesis,
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

    const chunk: OneMinuteBar[] = [];
    const flushChunk = (): void => {
      if (chunk.length === 0) {
        return;
      }
      const bars = chunk.splice(0, chunk.length);
      this.mergeBars(bars);
    };

    await streamNdjsonValues<OneMinuteBar>(this.config.archivePath, (bar) => {
      chunk.push(bar);
      if (chunk.length >= 2_000) {
        flushChunk();
      }
    });
    flushChunk();
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

  private buildTradeExpiry(timestamp: string): string {
    return new Date(Date.parse(timestamp) + this.config.maxHoldMinutes * 60_000).toISOString();
  }

  private isSessionWindowEnforced(): boolean {
    const paperStatus = this.config.getPaperTradingStatus?.() ?? null;
    return paperStatus?.autonomyMode !== 'UNRESTRICTED';
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

  private buildAdaptiveRiskPct(thesis: PaperAutonomyThesis, symbol: SymbolCode, confidence: number): number {
    const evaluated = [...this.ideas.values()].filter(
      (idea) => idea.thesis === thesis && idea.symbol === symbol && idea.status === 'CLOSED' && idea.outcome
    );
    const hitRate =
      evaluated.length > 0
        ? evaluated.filter((idea) => idea.outcome === 'WIN').length / evaluated.length
        : 0.5;
    const baseRiskPct = 0.2 + confidence * 0.55;
    const performanceBias = evaluated.length >= 4 ? (hitRate - 0.5) * 0.7 : 0;
    return round(clamp(baseRiskPct + performanceBias, 0.15, 1.25), 2);
  }

  private buildPortfolioAdjustment(
    symbol: SymbolCode,
    thesis: PaperAutonomyThesis,
    side: Side
  ): PaperAutonomyPortfolioAdjustment {
    const reasons: string[] = [];
    let scoreAdjustment = 0;
    let riskMultiplier = 1;

    const openIdeas = [...this.ideas.values()].filter((idea) => idea.status === 'OPEN');
    const sameSymbolOpen = openIdeas.filter((idea) => idea.symbol === symbol);
    const sameThesisOpen = sameSymbolOpen.filter((idea) => idea.thesis === thesis && idea.side === side);
    const sameSideOpen = sameSymbolOpen.filter((idea) => idea.side === side);

    if (sameThesisOpen.length > 0) {
      scoreAdjustment -= sameThesisOpen.length * 3.5;
      riskMultiplier *= clamp(1 - sameThesisOpen.length * 0.08, 0.45, 1);
      reasons.push(`thesis crowding x${sameThesisOpen.length}`);
    }

    if (sameSideOpen.length >= 3) {
      const sidePressure = sameSideOpen.length - 2;
      scoreAdjustment -= sidePressure * 2.25;
      riskMultiplier *= clamp(1 - sidePressure * 0.06, 0.5, 1);
      reasons.push(`direction stacking x${sameSideOpen.length}`);
    }

    const closedIdeas = [...this.ideas.values()]
      .filter((idea) => idea.status === 'CLOSED')
      .sort((left, right) => (right.closedAt ?? right.openedAt).localeCompare(left.closedAt ?? left.openedAt));
    const recentClosedIdeas = closedIdeas.slice(0, 10);
    let losingStreak = 0;
    for (const idea of recentClosedIdeas) {
      if (idea.outcome === 'LOSS') {
        losingStreak += 1;
        continue;
      }
      break;
    }

    if (losingStreak >= 2) {
      scoreAdjustment -= losingStreak * 2.5;
      riskMultiplier *= clamp(1 - losingStreak * 0.1, 0.4, 1);
      reasons.push(`recent loss streak ${losingStreak}`);
    }

    if (recentClosedIdeas.length >= 4) {
      const averageRecentR = average(recentClosedIdeas.map((idea) => idea.realizedR ?? 0));
      if (averageRecentR < 0) {
        scoreAdjustment += averageRecentR * 6;
        riskMultiplier *= clamp(1 + averageRecentR * 0.18, 0.45, 1);
        reasons.push(`recent avgR ${round(averageRecentR, 2)}`);
      }
    }

    const paperStatus = this.config.getPaperTradingStatus?.() ?? null;
    if (paperStatus) {
      const exposureCount = paperStatus.openTrades + paperStatus.pendingEntries;
      if (exposureCount >= 6) {
        const exposurePressure = exposureCount - 5;
        scoreAdjustment -= exposurePressure * 1.8;
        riskMultiplier *= clamp(1 - exposurePressure * 0.05, 0.45, 1);
        reasons.push(`portfolio exposure ${exposureCount}`);
      }

      if (paperStatus.closedTrades >= 6 && paperStatus.hitRate < 0.45) {
        const hitRateGap = 0.45 - paperStatus.hitRate;
        scoreAdjustment -= hitRateGap * 20;
        riskMultiplier *= clamp(1 - hitRateGap * 1.2, 0.45, 1);
        reasons.push(`hit rate ${round(paperStatus.hitRate * 100, 0)}%`);
      }

      const drawdownPct =
        paperStatus.initialBalance > 0
          ? Math.max(0, ((paperStatus.initialBalance - paperStatus.equity) / paperStatus.initialBalance) * 100)
          : 0;
      if (drawdownPct > 0.2) {
        scoreAdjustment -= drawdownPct * 2.4;
        riskMultiplier *= clamp(1 - drawdownPct * 0.12, 0.35, 1);
        reasons.push(`drawdown ${drawdownPct.toFixed(2)}%`);
      }

      if (paperStatus.closedTrades >= 8 && paperStatus.hitRate > 0.58 && paperStatus.realizedPnl > 0) {
        scoreAdjustment += 1.5;
        riskMultiplier *= 1.04;
        reasons.push('portfolio momentum positive');
      }
    }

    return {
      scoreAdjustment: round(clamp(scoreAdjustment, -30, 6), 2),
      riskMultiplier: round(clamp(riskMultiplier, 0.25, 1.1), 2),
      summary: reasons.length > 0 ? reasons.join(' • ') : 'base pressure'
    };
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

  private resolveTradableBias(
    symbol: SymbolCode,
    candles5m: Candle[],
    candles15m: Candle[],
    candles1H: Candle[]
  ): {
    direction: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>;
    confidence: number;
    reason: string;
    exploratory: boolean;
  } | null {
    const trend = this.resolveResearchDirection(symbol, candles5m, candles15m, candles1H);
    if ((trend.direction === 'BULLISH' || trend.direction === 'BEARISH') && trend.confidence >= this.config.minTrendConfidence) {
      return {
        direction: trend.direction,
        confidence: trend.confidence,
        reason: trend.reason,
        exploratory: false
      };
    }

    if (candles5m.length < 8 || candles15m.length < 4 || candles1H.length < 3) {
      return null;
    }

    const current = candles5m.at(-1);
    const previous = candles5m.at(-2);
    if (!current || !previous) {
      return null;
    }

    const closes5m = candles5m.map((candle) => candle.close);
    const closes15m = candles15m.map((candle) => candle.close);
    const closes1H = candles1H.map((candle) => candle.close);
    const ema9 = calcEma(closes5m, 9).at(-1) ?? current.close;
    const ema20 = calcEma(closes5m, 20).at(-1) ?? current.close;
    const ema15 = calcEma(closes15m, 8).at(-1) ?? closes15m.at(-1) ?? current.close;
    const ema1H = calcEma(closes1H, 5).at(-1) ?? closes1H.at(-1) ?? current.close;
    const recent5m = takeLast(candles5m, 6);
    const swingHigh = Math.max(...recent5m.slice(0, -1).map((candle) => candle.high));
    const swingLow = Math.min(...recent5m.slice(0, -1).map((candle) => candle.low));

    const bullishVotes =
      Number(current.close > ema9)
      + Number(ema9 >= ema20)
      + Number((closes15m.at(-1) ?? current.close) >= ema15)
      + Number((closes1H.at(-1) ?? current.close) >= ema1H)
      + Number(current.close > previous.close)
      + Number(current.close >= swingHigh);
    const bearishVotes =
      Number(current.close < ema9)
      + Number(ema9 <= ema20)
      + Number((closes15m.at(-1) ?? current.close) <= ema15)
      + Number((closes1H.at(-1) ?? current.close) <= ema1H)
      + Number(current.close < previous.close)
      + Number(current.close <= swingLow);

    if (bullishVotes === bearishVotes) {
      return null;
    }

    const direction = bullishVotes > bearishVotes ? 'BULLISH' : 'BEARISH';
    const dominantVotes = Math.max(bullishVotes, bearishVotes);
    const confidence = round(clamp(0.28 + dominantVotes * 0.05 + Math.abs(bullishVotes - bearishVotes) * 0.04, 0.3, 0.62), 2);
    const reason =
      direction === 'BULLISH'
        ? 'Autonomous engine is exploring a bullish bias from local momentum, reclaim, and higher-timeframe drift.'
        : 'Autonomous engine is exploring a bearish bias from local momentum, rejection, and higher-timeframe drift.';

    return {
      direction,
      confidence,
      reason,
      exploratory: true
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

  private buildRangeFadeIdea(
    symbol: SymbolCode,
    candles5m: Candle[],
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
    const lookback = Math.max(10, this.config.pullbackLookbackBars5m + 2);
    if (candles5m.length < lookback) {
      return null;
    }

    const current = candles5m.at(-1);
    const previous = candles5m.at(-2);
    if (!current || !previous) {
      return null;
    }

    const recent = takeLast(candles5m, lookback);
    const atr = calcAtr(candles5m, 14);
    if (atr <= 0) {
      return null;
    }

    const recentHigh = Math.max(...recent.map((candle) => candle.high));
    const recentLow = Math.min(...recent.map((candle) => candle.low));
    const range = recentHigh - recentLow;
    if (range < atr * 1.4) {
      return null;
    }

    const closes = candles5m.map((candle) => candle.close);
    const ema20 = calcEma(closes, 20).at(-1) ?? current.close;
    const midpoint = (recentHigh + recentLow) / 2;
    const lowerFadeBand = recentLow + range * 0.28;
    const upperFadeBand = recentHigh - range * 0.28;

    if (current.low <= lowerFadeBand && current.close > current.open && current.close >= previous.close) {
      const stopLoss = round(recentLow - atr * 0.18, 2);
      if (stopLoss >= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const target = Math.max(midpoint, ema20);
      if (target <= entry) {
        return null;
      }
      const score = round(
        clamp(54 + (1 - confidence) * 10 + this.buildThesisBias('RANGE_FADE_REVERSION', symbol), 0, 100),
        2
      );
      return {
        thesis: 'RANGE_FADE_REVERSION',
        side: 'LONG',
        entry,
        stopLoss,
        takeProfit: round(target, 2),
        score,
        reason: 'Autonomous range fade: 5m flushed into local range support and reclaimed back toward fair value.'
      };
    }

    if (current.high >= upperFadeBand && current.close < current.open && current.close <= previous.close) {
      const stopLoss = round(recentHigh + atr * 0.18, 2);
      if (stopLoss <= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const target = Math.min(midpoint, ema20);
      if (target >= entry) {
        return null;
      }
      const score = round(
        clamp(54 + (1 - confidence) * 10 + this.buildThesisBias('RANGE_FADE_REVERSION', symbol), 0, 100),
        2
      );
      return {
        thesis: 'RANGE_FADE_REVERSION',
        side: 'SHORT',
        entry,
        stopLoss,
        takeProfit: round(target, 2),
        score,
        reason: 'Autonomous range fade: 5m extended into local range resistance and mean-reverted toward fair value.'
      };
    }

    return null;
  }

  private buildFailedBreakoutIdea(
    symbol: SymbolCode,
    candles5m: Candle[],
    trendDirection: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>,
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
    const lookback = Math.max(8, this.config.breakoutLookbackBars5m + 2);
    if (candles5m.length < lookback) {
      return null;
    }

    const current = candles5m.at(-1);
    if (!current) {
      return null;
    }
    const prior = takeLast(candles5m, lookback).slice(0, -1);
    if (prior.length < lookback - 1) {
      return null;
    }
    const atr = calcAtr(candles5m, 14);
    if (atr <= 0) {
      return null;
    }

    const priorHigh = Math.max(...prior.map((candle) => candle.high));
    const priorLow = Math.min(...prior.map((candle) => candle.low));

    if (current.high >= priorHigh + atr * 0.06 && current.close < priorHigh && current.close < current.open) {
      const stopLoss = round(Math.max(current.high, priorHigh) + atr * 0.16, 2);
      if (stopLoss <= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const risk = stopLoss - entry;
      const takeProfit = round(entry - risk * clamp(1.5 + (1 - confidence) * 0.6, 1.5, 2.2), 2);
      const trendBonus = trendDirection === 'BEARISH' ? 4 : trendDirection === 'BULLISH' ? -4 : 0;
      const score = round(
        clamp(57 + (1 - confidence) * 12 + trendBonus + this.buildThesisBias('FAILED_BREAKOUT_REVERSAL', symbol), 0, 100),
        2
      );
      return {
        thesis: 'FAILED_BREAKOUT_REVERSAL',
        side: 'SHORT',
        entry,
        stopLoss,
        takeProfit,
        score,
        reason: 'Autonomous failed breakout reversal: 5m swept above local range and closed back inside it.'
      };
    }

    if (current.low <= priorLow - atr * 0.06 && current.close > priorLow && current.close > current.open) {
      const stopLoss = round(Math.min(current.low, priorLow) - atr * 0.16, 2);
      if (stopLoss >= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const risk = entry - stopLoss;
      const takeProfit = round(entry + risk * clamp(1.5 + (1 - confidence) * 0.6, 1.5, 2.2), 2);
      const trendBonus = trendDirection === 'BULLISH' ? 4 : trendDirection === 'BEARISH' ? -4 : 0;
      const score = round(
        clamp(57 + (1 - confidence) * 12 + trendBonus + this.buildThesisBias('FAILED_BREAKOUT_REVERSAL', symbol), 0, 100),
        2
      );
      return {
        thesis: 'FAILED_BREAKOUT_REVERSAL',
        side: 'LONG',
        entry,
        stopLoss,
        takeProfit,
        score,
        reason: 'Autonomous failed breakout reversal: 5m flushed below local range and reclaimed back inside it.'
      };
    }

    return null;
  }

  private buildCompressionReleaseIdea(
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
    if (candles5m.length < 12) {
      return null;
    }

    const current = candles5m.at(-1);
    if (!current) {
      return null;
    }
    const recent = takeLast(candles5m, 6);
    const compression = recent.slice(0, -1);
    if (compression.length < 5) {
      return null;
    }
    const atr = calcAtr(candles5m, 14);
    if (atr <= 0) {
      return null;
    }
    const avgCompressionRange = average(compression.map((candle) => candle.high - candle.low));
    const compressionHigh = Math.max(...compression.map((candle) => candle.high));
    const compressionLow = Math.min(...compression.map((candle) => candle.low));
    const compressionRange = compressionHigh - compressionLow;
    const currentRange = current.high - current.low;

    if (avgCompressionRange > atr * 0.85 || compressionRange > atr * 2.4 || currentRange < avgCompressionRange * 1.35) {
      return null;
    }

    if (direction === 'BULLISH' && current.close > compressionHigh && current.close > current.open) {
      const stopLoss = round(compressionLow - atr * 0.14, 2);
      if (stopLoss >= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const risk = entry - stopLoss;
      const takeProfit = round(entry + risk * clamp(1.6 + confidence * 0.45, 1.6, 2.25), 2);
      const score = round(
        clamp(58 + confidence * 16 + this.buildThesisBias('VOLATILITY_COMPRESSION_RELEASE', symbol), 0, 100),
        2
      );
      return {
        thesis: 'VOLATILITY_COMPRESSION_RELEASE',
        side: 'LONG',
        entry,
        stopLoss,
        takeProfit,
        score,
        reason: 'Autonomous compression release: 5m volatility coiled and broke higher with expansion.'
      };
    }

    if (direction === 'BEARISH' && current.close < compressionLow && current.close < current.open) {
      const stopLoss = round(compressionHigh + atr * 0.14, 2);
      if (stopLoss <= current.close) {
        return null;
      }
      const entry = round(current.close, 2);
      const risk = stopLoss - entry;
      const takeProfit = round(entry - risk * clamp(1.6 + confidence * 0.45, 1.6, 2.25), 2);
      const score = round(
        clamp(58 + confidence * 16 + this.buildThesisBias('VOLATILITY_COMPRESSION_RELEASE', symbol), 0, 100),
        2
      );
      return {
        thesis: 'VOLATILITY_COMPRESSION_RELEASE',
        side: 'SHORT',
        entry,
        stopLoss,
        takeProfit,
        score,
        reason: 'Autonomous compression release: 5m volatility coiled and broke lower with expansion.'
      };
    }

    return null;
  }

  private buildSymbolStatus(symbol: SymbolCode): PaperAutonomySymbolStatus {
    const bars = this.barsBySymbol.get(symbol) ?? [];
    const latestBarTimestamp = bars.at(-1)?.timestamp;
    const ideas = [...this.ideas.values()].filter((idea) => idea.symbol === symbol);
    const openIdeas = ideas.filter((idea) => idea.status === 'OPEN');
    const closedIdeas = ideas.filter((idea) => idea.status === 'CLOSED');
    const wins = closedIdeas.filter((idea) => idea.outcome === 'WIN').length;
    const realizedPnl = round(closedIdeas.reduce((sum, idea) => sum + (idea.realizedPnl ?? 0), 0), 2);

    if (bars.length < 40 || !latestBarTimestamp) {
      return {
        symbol,
        direction: 'STAND_ASIDE',
        confidence: 0,
        exploratory: false,
        reason: 'Autonomy engine is still building enough bars for this symbol.',
        latestBarTimestamp,
        openIdeas: openIdeas.length,
        closedIdeas: closedIdeas.length,
        winRate: closedIdeas.length > 0 ? round(wins / closedIdeas.length, 2) : 0,
        realizedPnl
      };
    }

    const candles5m = completeCandles(bars, latestBarTimestamp, 5, 30);
    const candles15m = completeCandles(bars, latestBarTimestamp, 15, 20);
    const candles1H = completeCandles(bars, latestBarTimestamp, 60, 12);
    const tradable = this.resolveTradableBias(symbol, candles5m, candles15m, candles1H);
    const trend = tradable ?? this.resolveResearchDirection(symbol, candles5m, candles15m, candles1H);

    return {
      symbol,
      direction: trend.direction,
      confidence: round(trend.confidence ?? 0, 2),
      exploratory: Boolean('exploratory' in trend && trend.exploratory),
      reason: trend.reason,
      latestBarTimestamp,
      openIdeas: openIdeas.length,
      closedIdeas: closedIdeas.length,
      winRate: closedIdeas.length > 0 ? round(wins / closedIdeas.length, 2) : 0,
      realizedPnl
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

    const barsUntilNow = bars.slice(0, currentIndex + 1);
    const candles5m = completeCandles(barsUntilNow, currentBar.timestamp, 5, 30);
    const candles15m = completeCandles(barsUntilNow, currentBar.timestamp, 15, 20);
    const candles1H = completeCandles(barsUntilNow, currentBar.timestamp, 60, 12);
    if (candles5m.length < 12 || candles15m.length < 6 || candles1H.length < 4) {
      return;
    }

    const trend = this.resolveTradableBias(symbol, candles5m, candles15m, candles1H);
    if (!trend) {
      return;
    }
    const rawIdeas = [
      this.buildBreakoutIdea(symbol, candles5m, trend.direction, trend.confidence),
      this.buildPullbackIdea(symbol, candles5m, trend.direction, trend.confidence),
      this.buildRangeFadeIdea(symbol, candles5m, trend.confidence),
      this.buildFailedBreakoutIdea(symbol, candles5m, trend.direction, trend.confidence),
      this.buildCompressionReleaseIdea(symbol, candles5m, trend.direction, trend.confidence)
    ].filter((idea): idea is NonNullable<typeof idea> => Boolean(idea));

    const minimumIdeaScore = trend.exploratory ? 58 : 54;
    const ideas = rawIdeas
      .map((idea) => {
        const adjustment = this.buildPortfolioAdjustment(symbol, idea.thesis, idea.side);
        const adjustedScore = round(clamp(idea.score + adjustment.scoreAdjustment, 0, 100), 2);
        const adaptiveRiskPct = round(
          clamp(this.buildAdaptiveRiskPct(idea.thesis, symbol, trend.confidence) * adjustment.riskMultiplier, 0.1, 1.25),
          2
        );
        return {
          ...idea,
          rawScore: idea.score,
          score: adjustedScore,
          adaptiveRiskPct,
          portfolioAdjustment: adjustment
        };
      })
      .filter((idea) => idea.score >= minimumIdeaScore);

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
        autonomyReason: `${bestIdea.reason} • ${bestIdea.portfolioAdjustment.summary}`,
        researchDirection: trend.direction,
        researchConfidence: trend.confidence,
        exploratory: trend.exploratory,
        independentPaperEngine: true,
        autonomyRawScore: bestIdea.rawScore,
        autonomyAdjustedScore: bestIdea.score,
        autonomyPortfolioAdjustment: bestIdea.portfolioAdjustment.summary,
        paperAutonomyRiskPct: bestIdea.adaptiveRiskPct,
        paperTradeExpiresAt: this.buildTradeExpiry(currentBar.timestamp)
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
      reason: `${bestIdea.reason} • ${bestIdea.portfolioAdjustment.summary}`,
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
    const unrestrictedSession = !this.isSessionWindowEnforced();
    const ideas = [...this.ideas.values()].sort((left, right) => right.openedAt.localeCompare(left.openedAt));
    const openIdeas = ideas.filter((idea) => idea.status === 'OPEN');
    const closedIdeas = ideas.filter((idea) => idea.status === 'CLOSED');
    const wins = closedIdeas.filter((idea) => idea.outcome === 'WIN').length;
    const losses = closedIdeas.filter((idea) => idea.outcome === 'LOSS').length;
    const flats = closedIdeas.filter((idea) => idea.outcome === 'FLAT').length;
    const realizedPnl = round(closedIdeas.reduce((sum, idea) => sum + (idea.realizedPnl ?? 0), 0), 2);
    const realizedR = round(closedIdeas.reduce((sum, idea) => sum + (idea.realizedR ?? 0), 0), 2);
    const thesisStats: PaperAutonomyThesisStats[] = PAPER_AUTONOMY_THESES
      .map((thesis) => {
        const thesisIdeas = ideas.filter((idea) => idea.thesis === thesis);
        const thesisClosed = thesisIdeas.filter((idea) => idea.status === 'CLOSED');
        const thesisWins = thesisClosed.filter((idea) => idea.outcome === 'WIN').length;
        const thesisLosses = thesisClosed.filter((idea) => idea.outcome === 'LOSS').length;
        const thesisFlats = thesisClosed.filter((idea) => idea.outcome === 'FLAT').length;
        return {
          thesis,
          label: thesisLabel(thesis),
          total: thesisIdeas.length,
          open: thesisIdeas.filter((idea) => idea.status === 'OPEN').length,
          closed: thesisClosed.length,
          wins: thesisWins,
          losses: thesisLosses,
          flats: thesisFlats,
          hitRate: thesisClosed.length > 0 ? round(thesisWins / thesisClosed.length, 2) : 0,
          avgR: thesisClosed.length > 0 ? round(average(thesisClosed.map((idea) => idea.realizedR ?? 0)), 2) : 0,
          realizedPnl: round(thesisClosed.reduce((sum, idea) => sum + (idea.realizedPnl ?? 0), 0), 2),
          lastOpenedAt: thesisIdeas[0]?.openedAt
        };
      })
      .filter((entry) => entry.total > 0);
    const bestThesisStats =
      [...thesisStats]
        .filter((entry) => entry.closed > 0)
        .sort((left, right) =>
          right.hitRate - left.hitRate
          || right.avgR - left.avgR
          || right.closed - left.closed
        )[0]
      ?? [...thesisStats].sort((left, right) => right.total - left.total || right.open - left.open)[0]
      ?? null;
    const activeTheses = thesisStats
      .filter((entry) => entry.open > 0)
      .sort((left, right) => right.open - left.open || right.total - left.total)
      .map((entry) => ({
        thesis: entry.thesis,
        label: entry.label,
        openIdeas: entry.open,
        totalIdeas: entry.total,
        lastOpenedAt: entry.lastOpenedAt
      }));
    const symbolStatus = this.config.focusSymbols.map((symbol) => this.buildSymbolStatus(symbol));

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
        startHour: unrestrictedSession ? 0 : this.config.sessionStartHour,
        startMinute: unrestrictedSession ? 0 : this.config.sessionStartMinute,
        endHour: unrestrictedSession ? 23 : this.config.sessionEndHour,
        endMinute: unrestrictedSession ? 59 : this.config.sessionEndMinute
      },
      totalIdeas: ideas.length,
      openIdeas: openIdeas.length,
      closedIdeas: closedIdeas.length,
      winRate: closedIdeas.length > 0 ? round(wins / closedIdeas.length, 2) : 0,
      performance: {
        realizedPnl,
        realizedR,
        avgR: closedIdeas.length > 0 ? round(realizedR / closedIdeas.length, 2) : 0,
        wins,
        losses,
        flats,
        learningSamples: closedIdeas.length
      },
      bestThesis: bestThesisStats
        ? {
            thesis: bestThesisStats.thesis,
            label: bestThesisStats.label,
            hitRate: bestThesisStats.hitRate,
            avgR: bestThesisStats.avgR,
            closed: bestThesisStats.closed,
            realizedPnl: bestThesisStats.realizedPnl
          }
        : null,
      activeTheses,
      symbolStatus,
      thesisStats,
      recentIdeas: ideas.slice(0, 12),
      recentClosedIdeas: closedIdeas.slice(0, 8)
    };
  }
}
