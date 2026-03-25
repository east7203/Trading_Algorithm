import fs from 'node:fs/promises';
import type { SymbolCode, Timeframe } from '../domain/types.js';
import { aggregateBars, parseOneMinuteCsv, type OneMinuteBar } from '../training/historicalTrainer.js';

export type ResearchTrendDirection = 'BULLISH' | 'BEARISH' | 'BALANCED' | 'STAND_ASIDE';

export interface MarketResearchFrameScore {
  timeframe: Extract<Timeframe, '5m' | '15m' | '1H'>;
  score: number;
  summary: string;
}

export interface MarketResearchSymbolStatus {
  symbol: SymbolCode;
  direction: Exclude<ResearchTrendDirection, 'STAND_ASIDE'>;
  confidence: number;
  compositeScore: number;
  latestPrice?: number;
  latestBarTimestamp?: string;
  frameScores: MarketResearchFrameScore[];
  reason: string;
  reasons: string[];
}

export interface MarketResearchOverallTrend {
  direction: ResearchTrendDirection;
  confidence: number;
  score: number;
  aligned: boolean;
  leadSymbol?: SymbolCode;
  reason: string;
  reasons: string[];
}

export interface MarketResearchPredictionEpisode {
  direction: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>;
  openedAt: string;
  evaluatedAt?: string;
  leadSymbol?: SymbolCode;
  confidence: number;
  outcome?: 'WIN' | 'LOSS';
  moveBySymbol: Partial<Record<SymbolCode, number>>;
}

export interface MarketResearchPerformanceSummary {
  evaluationMinutes: number;
  totalPredictions: number;
  openPredictions: number;
  evaluatedPredictions: number;
  winningPredictions: number;
  losingPredictions: number;
  hitRate: number;
  lastEvaluatedAt?: string;
  lastOutcome?: 'WIN' | 'LOSS';
  recentEpisodes: MarketResearchPredictionEpisode[];
}

export interface MarketResearchStatus {
  enabled: boolean;
  started: boolean;
  lastComputedAt?: string;
  lastError?: string;
  latestBarTimestampBySymbol: Partial<Record<SymbolCode, string>>;
  overallTrend: MarketResearchOverallTrend;
  symbols: MarketResearchSymbolStatus[];
  data: {
    archivePath?: string;
    bootstrapCsvDir?: string;
    bootstrapRecursive: boolean;
    maxBarsPerSymbol: number;
    focusSymbols: SymbolCode[];
    analysisTimeframes: Array<Extract<Timeframe, '5m' | '15m' | '1H'>>;
  };
  performance: MarketResearchPerformanceSummary;
}

export interface MarketResearchTrendFlipEvent {
  previousDirection: ResearchTrendDirection;
  nextTrend: MarketResearchOverallTrend;
  changedAt: string;
  symbolStatuses: MarketResearchSymbolStatus[];
}

export interface MarketResearchConfig {
  enabled: boolean;
  archivePath?: string;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  maxBarsPerSymbol: number;
  focusSymbols: SymbolCode[];
  flipNotificationMinConfidence?: number;
  evaluationMinutes?: number;
  onTrendFlip?: (event: MarketResearchTrendFlipEvent) => Promise<void> | void;
}

const ANALYSIS_TIMEFRAMES: Array<Extract<Timeframe, '5m' | '15m' | '1H'>> = ['5m', '15m', '1H'];

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const takeLast = <T>(items: T[], count: number): T[] =>
  items.length <= count ? items : items.slice(items.length - count);

const listCsvFiles = async (dirPath: string, recursive: boolean): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = `${dirPath}/${entry.name}`;
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...(await listCsvFiles(fullPath, true)));
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      files.push(fullPath);
    }
  }

  return files;
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

const averageRange = (bars: Array<{ high: number; low: number }>): number =>
  Math.max(
    average(
      bars.map((bar) => Math.max(0.01, bar.high - bar.low))
    ),
    0.01
  );

const ema = (values: number[], period: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const effectivePeriod = Math.max(1, Math.min(period, values.length));
  const smoothing = 2 / (effectivePeriod + 1);
  let current = values[0];
  for (let index = 1; index < values.length; index += 1) {
    current = values[index] * smoothing + current * (1 - smoothing);
  }
  return current;
};

const scoreLabel = (score: number, timeframe: string): string => {
  if (score >= 0.9) {
    return `${timeframe} is pressing higher.`;
  }
  if (score >= 0.35) {
    return `${timeframe} is leaning up.`;
  }
  if (score <= -0.9) {
    return `${timeframe} is pressing lower.`;
  }
  if (score <= -0.35) {
    return `${timeframe} is leaning down.`;
  }
  return `${timeframe} is mixed.`;
};

const scoreTimeframe = (
  bars: OneMinuteBar[],
  intervalMinutes: 5 | 15 | 60,
  momentumLookback: number
): MarketResearchFrameScore => {
  const timeframe = intervalMinutes === 60 ? '1H' : `${intervalMinutes}m`;
  const candles = aggregateBars(bars, intervalMinutes);
  const sample = takeLast(candles, intervalMinutes === 60 ? 24 : 40);
  if (sample.length < 8) {
    return {
      timeframe: timeframe as MarketResearchFrameScore['timeframe'],
      score: 0,
      summary: `${timeframe} needs more bars.`
    };
  }

  const closes = sample.map((bar) => bar.close);
  const ranges = averageRange(sample);
  const latest = closes.at(-1) ?? 0;
  const momentumAnchor = closes.at(Math.max(0, closes.length - 1 - momentumLookback)) ?? latest;
  const fastEma = ema(closes, intervalMinutes === 60 ? 5 : 8);
  const slowEma = ema(closes, intervalMinutes === 60 ? 8 : 21);
  const directionalCloses = sample.slice(1).map((bar, index) => Math.sign(bar.close - sample[index].close));
  const structureComponent =
    directionalCloses.length > 0
      ? directionalCloses.reduce((sum, value) => sum + value, 0) / directionalCloses.length
      : 0;
  const breakoutMid = average(sample.map((bar) => (bar.high + bar.low) / 2));

  const emaComponent = clamp((fastEma - slowEma) / ranges, -2.5, 2.5);
  const momentumComponent = clamp((latest - momentumAnchor) / ranges, -2.5, 2.5);
  const locationComponent = clamp((latest - breakoutMid) / ranges, -2, 2);
  const score = clamp(emaComponent * 0.45 + momentumComponent * 0.35 + structureComponent * 0.1 + locationComponent * 0.1, -3, 3);

  return {
    timeframe: timeframe as MarketResearchFrameScore['timeframe'],
    score,
    summary: scoreLabel(score, timeframe)
  };
};

const directionFromScore = (score: number): Exclude<ResearchTrendDirection, 'STAND_ASIDE'> => {
  if (score >= 0.75) {
    return 'BULLISH';
  }
  if (score <= -0.75) {
    return 'BEARISH';
  }
  return 'BALANCED';
};

const buildSymbolStatus = (symbol: SymbolCode, bars: OneMinuteBar[]): MarketResearchSymbolStatus | null => {
  const sample = takeLast(
    bars.slice().sort((left, right) => left.timestamp.localeCompare(right.timestamp)),
    24 * 60
  );
  if (sample.length < 90) {
    return null;
  }

  const frameScores = [
    scoreTimeframe(sample, 5, 6),
    scoreTimeframe(sample, 15, 4),
    scoreTimeframe(sample, 60, 3)
  ];
  const compositeScore = clamp(
    frameScores[0].score * 0.5 + frameScores[1].score * 0.3 + frameScores[2].score * 0.2,
    -3,
    3
  );
  const direction = directionFromScore(compositeScore);
  const alignedFrames = frameScores.filter((frame) =>
    direction === 'BULLISH'
      ? frame.score > 0.35
      : direction === 'BEARISH'
        ? frame.score < -0.35
        : Math.abs(frame.score) < 0.9
  ).length;
  const confidence = clamp((Math.abs(compositeScore) / 3) * 0.7 + (alignedFrames / frameScores.length) * 0.3, 0, 1);
  const latest = sample.at(-1);
  const bullish = frameScores.filter((frame) => frame.score > 0.35).length;
  const bearish = frameScores.filter((frame) => frame.score < -0.35).length;
  const reasons = [
    ...frameScores.map((frame) => frame.summary),
    bullish > bearish
      ? `${symbol} has more bullish than bearish structure across the stack.`
      : bearish > bullish
        ? `${symbol} has more bearish than bullish structure across the stack.`
        : `${symbol} is split across the stack.`
  ];

  const reason =
    direction === 'BULLISH'
      ? `${symbol} is trending higher across the research stack.`
      : direction === 'BEARISH'
        ? `${symbol} is trending lower across the research stack.`
        : `${symbol} does not have a clean autonomous trend yet.`;

  return {
    symbol,
    direction,
    confidence: Number(confidence.toFixed(2)),
    compositeScore: Number(compositeScore.toFixed(2)),
    latestPrice: latest?.close,
    latestBarTimestamp: latest?.timestamp,
    frameScores: frameScores.map((frame) => ({
      ...frame,
      score: Number(frame.score.toFixed(2))
    })),
    reason,
    reasons
  };
};

const defaultOverallTrend = (): MarketResearchOverallTrend => ({
  direction: 'STAND_ASIDE',
  confidence: 0,
  score: 0,
  aligned: false,
  reason: 'Research model is waiting for enough live bars.',
  reasons: ['The autonomous trend model needs more live data before it can lean.']
});

const defaultPerformanceSummary = (evaluationMinutes: number): MarketResearchPerformanceSummary => ({
  evaluationMinutes,
  totalPredictions: 0,
  openPredictions: 0,
  evaluatedPredictions: 0,
  winningPredictions: 0,
  losingPredictions: 0,
  hitRate: 0,
  recentEpisodes: []
});

const buildOverallTrend = (symbols: MarketResearchSymbolStatus[]): MarketResearchOverallTrend => {
  if (symbols.length === 0) {
    return defaultOverallTrend();
  }

  const leadSymbol = symbols
    .slice()
    .sort((left, right) => Math.abs(right.compositeScore) - Math.abs(left.compositeScore))[0];
  const bullish = symbols.filter((status) => status.direction === 'BULLISH');
  const bearish = symbols.filter((status) => status.direction === 'BEARISH');
  const averageScore = average(symbols.map((status) => status.compositeScore));
  const averageConfidence = average(symbols.map((status) => status.confidence));
  const aligned = bullish.length === symbols.length || bearish.length === symbols.length;

  if (aligned && bullish.length === symbols.length) {
    return {
      direction: 'BULLISH',
      confidence: Number(averageConfidence.toFixed(2)),
      score: Number(averageScore.toFixed(2)),
      aligned: true,
      leadSymbol: leadSymbol.symbol,
      reason: `NQ and ES are aligned bullish. ${leadSymbol.symbol} is leading the move.`,
      reasons: symbols.map((status) => `${status.symbol}: ${status.reason}`)
    };
  }

  if (aligned && bearish.length === symbols.length) {
    return {
      direction: 'BEARISH',
      confidence: Number(averageConfidence.toFixed(2)),
      score: Number(averageScore.toFixed(2)),
      aligned: true,
      leadSymbol: leadSymbol.symbol,
      reason: `NQ and ES are aligned bearish. ${leadSymbol.symbol} is leading the move.`,
      reasons: symbols.map((status) => `${status.symbol}: ${status.reason}`)
    };
  }

  if (bullish.length > 0 && bearish.length > 0) {
    return {
      direction: 'STAND_ASIDE',
      confidence: Number(averageConfidence.toFixed(2)),
      score: Number(averageScore.toFixed(2)),
      aligned: false,
      leadSymbol: leadSymbol.symbol,
      reason: 'NQ and ES are diverging. The research model does not trust a clean market trend.',
      reasons: symbols.map((status) => `${status.symbol}: ${status.reason}`)
    };
  }

  if (leadSymbol && Math.abs(leadSymbol.compositeScore) >= 1.1 && leadSymbol.confidence >= 0.62) {
    return {
      direction: leadSymbol.direction,
      confidence: leadSymbol.confidence,
      score: leadSymbol.compositeScore,
      aligned: false,
      leadSymbol: leadSymbol.symbol,
      reason: `${leadSymbol.symbol} has the clearest autonomous trend, but breadth is not fully aligned yet.`,
      reasons: symbols.map((status) => `${status.symbol}: ${status.reason}`)
    };
  }

  return {
    direction: 'BALANCED',
    confidence: Number(averageConfidence.toFixed(2)),
    score: Number(averageScore.toFixed(2)),
    aligned: false,
    leadSymbol: leadSymbol.symbol,
    reason: 'The market does not have a strong autonomous trend yet.',
    reasons: symbols.map((status) => `${status.symbol}: ${status.reason}`)
  };
};

export class MarketResearchService {
  private started = false;
  private lastComputedAt: string | undefined;
  private lastError: string | undefined;
  private barsBySymbol = new Map<SymbolCode, OneMinuteBar[]>();
  private barKeys = new Set<string>();
  private overallTrend: MarketResearchOverallTrend = defaultOverallTrend();
  private symbolStatuses: MarketResearchSymbolStatus[] = [];
  private initialComputeComplete = false;
  private predictionEpisodes: MarketResearchPredictionEpisode[] = [];

  constructor(private readonly config: MarketResearchConfig) {}

  private get evaluationMinutes(): number {
    return this.config.evaluationMinutes ?? 60;
  }

  private buildPerformanceSummary(): MarketResearchPerformanceSummary {
    if (this.predictionEpisodes.length === 0) {
      return defaultPerformanceSummary(this.evaluationMinutes);
    }
    const evaluatedPredictions = this.predictionEpisodes.filter((episode) => episode.outcome);
    const winningPredictions = evaluatedPredictions.filter((episode) => episode.outcome === 'WIN').length;
    const losingPredictions = evaluatedPredictions.filter((episode) => episode.outcome === 'LOSS').length;
    const lastEvaluatedEpisode = evaluatedPredictions
      .slice()
      .sort((left, right) => (right.evaluatedAt ?? '').localeCompare(left.evaluatedAt ?? ''))[0];

    return {
      evaluationMinutes: this.evaluationMinutes,
      totalPredictions: this.predictionEpisodes.length,
      openPredictions: this.predictionEpisodes.length - evaluatedPredictions.length,
      evaluatedPredictions: evaluatedPredictions.length,
      winningPredictions,
      losingPredictions,
      hitRate:
        evaluatedPredictions.length > 0 ? Number((winningPredictions / evaluatedPredictions.length).toFixed(2)) : 0,
      lastEvaluatedAt: lastEvaluatedEpisode?.evaluatedAt,
      lastOutcome: lastEvaluatedEpisode?.outcome,
      recentEpisodes: this.predictionEpisodes
        .slice(-6)
        .reverse()
        .map((episode) => ({
          ...episode,
          moveBySymbol: { ...episode.moveBySymbol }
        }))
    };
  }

  private maybeOpenPrediction(
    previousTrend: MarketResearchOverallTrend,
    nextTrend: MarketResearchOverallTrend,
    symbolStatuses: MarketResearchSymbolStatus[],
    changedAt: string
  ): void {
    if (!['BULLISH', 'BEARISH'].includes(nextTrend.direction)) {
      return;
    }
    if (previousTrend.direction === nextTrend.direction) {
      return;
    }

    const entryPrices = Object.fromEntries(
      symbolStatuses
        .filter((status) => typeof status.latestPrice === 'number')
        .map((status) => [status.symbol, status.latestPrice as number])
    ) as Partial<Record<SymbolCode, number>>;

    this.predictionEpisodes.push({
      direction: nextTrend.direction as Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>,
      openedAt: changedAt,
      leadSymbol: nextTrend.leadSymbol,
      confidence: nextTrend.confidence,
      moveBySymbol: entryPrices
    });

    if (this.predictionEpisodes.length > 48) {
      this.predictionEpisodes = this.predictionEpisodes.slice(-48);
    }
  }

  private evaluatePredictions(changedAt: string, symbolStatuses: MarketResearchSymbolStatus[]): void {
    const nowMs = Date.parse(changedAt);
    const horizonMs = this.evaluationMinutes * 60_000;
    const latestPrices = new Map(
      symbolStatuses
        .filter((status) => typeof status.latestPrice === 'number')
        .map((status) => [status.symbol, status.latestPrice as number])
    );

    this.predictionEpisodes = this.predictionEpisodes.map((episode) => {
      if (episode.outcome || nowMs - Date.parse(episode.openedAt) < horizonMs) {
        return episode;
      }

      const directionalMoves = Object.entries(episode.moveBySymbol)
        .map(([symbol, entryPrice]) => {
          if (entryPrice === undefined) {
            return undefined;
          }
          const latestPrice = latestPrices.get(symbol as SymbolCode);
          if (latestPrice === undefined) {
            return undefined;
          }

          const rawMove = latestPrice - entryPrice;
          return {
            symbol: symbol as SymbolCode,
            move: episode.direction === 'BULLISH' ? rawMove : -rawMove,
            rawMove
          };
        })
        .filter(
          (value): value is { symbol: SymbolCode; move: number; rawMove: number } => typeof value?.move === 'number'
        );

      const wins = directionalMoves.filter((value) => value.move > 0).length;
      const losses = directionalMoves.length - wins;
      const updatedMoveBySymbol = Object.fromEntries(
        directionalMoves.map((value) => [value.symbol, Number(value.rawMove.toFixed(2))])
      ) as Partial<Record<SymbolCode, number>>;

      return {
        ...episode,
        evaluatedAt: changedAt,
        outcome: wins > losses ? 'WIN' : 'LOSS',
        moveBySymbol: updatedMoveBySymbol
      };
    });
  }

  private shouldNotifyTrendFlip(
    previousTrend: MarketResearchOverallTrend,
    nextTrend: MarketResearchOverallTrend
  ): boolean {
    if (!this.initialComputeComplete || !this.config.onTrendFlip) {
      return false;
    }
    if (previousTrend.direction === nextTrend.direction) {
      return false;
    }
    if (!['BULLISH', 'BEARISH'].includes(nextTrend.direction)) {
      return false;
    }
    return nextTrend.confidence >= (this.config.flipNotificationMinConfidence ?? 0.55);
  }

  private async recompute(): Promise<void> {
    const previousTrend = this.overallTrend;
    const symbols = this.config.focusSymbols
      .map((symbol) => buildSymbolStatus(symbol, this.barsBySymbol.get(symbol) ?? []))
      .filter((value): value is MarketResearchSymbolStatus => Boolean(value));

    const nextTrend = buildOverallTrend(symbols);
    const changedAt =
      symbols
        .map((status) => status.latestBarTimestamp)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString();
    const shouldNotifyTrendFlip = this.shouldNotifyTrendFlip(previousTrend, nextTrend);

    this.maybeOpenPrediction(previousTrend, nextTrend, symbols, changedAt);
    this.evaluatePredictions(changedAt, symbols);

    this.symbolStatuses = symbols;
    this.overallTrend = nextTrend;
    this.lastComputedAt = changedAt;
    this.initialComputeComplete = true;

    if (shouldNotifyTrendFlip) {
      await this.config.onTrendFlip?.({
        previousDirection: previousTrend.direction,
        nextTrend,
        changedAt,
        symbolStatuses: symbols
      });
    }
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

    const exists = await fs
      .stat(this.config.archivePath)
      .then((stats) => stats.isFile())
      .catch(() => false);
    if (!exists) {
      return;
    }

    const raw = await fs.readFile(this.config.archivePath, 'utf8');
    const bars: OneMinuteBar[] = [];
    for (const line of raw.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean)) {
      try {
        bars.push(JSON.parse(line) as OneMinuteBar);
      } catch {
        // Ignore malformed archive rows.
      }
    }

    this.mergeBars(bars);
  }

  private async loadBootstrapCsv(): Promise<void> {
    if (!this.config.bootstrapCsvDir) {
      return;
    }

    const exists = await fs
      .stat(this.config.bootstrapCsvDir)
      .then((stats) => stats.isDirectory())
      .catch(() => false);
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
      await this.loadArchiveBars();
      await this.loadBootstrapCsv();
      await this.recompute();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = (error as Error).message;
    }
  }

  stop(): void {
    this.started = false;
  }

  async ingestBars(rawBars: OneMinuteBar[]): Promise<{ accepted: number }> {
    if (!this.config.enabled || rawBars.length === 0) {
      return { accepted: 0 };
    }

    const beforeCount = this.barKeys.size;
    this.mergeBars(rawBars);
    await this.recompute();
    return { accepted: this.barKeys.size - beforeCount };
  }

  status(): MarketResearchStatus {
    const latestBarTimestampBySymbol = Object.fromEntries(
      this.config.focusSymbols
        .map((symbol) => [symbol, this.barsBySymbol.get(symbol)?.at(-1)?.timestamp])
        .filter(([, timestamp]) => Boolean(timestamp))
    ) as Partial<Record<SymbolCode, string>>;

    return {
      enabled: this.config.enabled,
      started: this.started,
      lastComputedAt: this.lastComputedAt,
      lastError: this.lastError,
      latestBarTimestampBySymbol,
      overallTrend: this.overallTrend,
      symbols: this.symbolStatuses,
      data: {
        archivePath: this.config.archivePath,
        bootstrapCsvDir: this.config.bootstrapCsvDir,
        bootstrapRecursive: this.config.bootstrapRecursive,
        maxBarsPerSymbol: this.config.maxBarsPerSymbol,
        focusSymbols: [...this.config.focusSymbols],
        analysisTimeframes: [...ANALYSIS_TIMEFRAMES]
      },
      performance: this.buildPerformanceSummary()
    };
  }
}
