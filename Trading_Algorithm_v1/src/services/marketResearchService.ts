import fs from 'node:fs/promises';
import path from 'node:path';
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
  symbol?: SymbolCode;
  confidence: number;
  outcome?: 'WIN' | 'LOSS';
  moveBySymbol: Partial<Record<SymbolCode, number>>;
  thesis?: MarketResearchExperimentThesis;
  thesisSummary?: string;
  source?: MarketResearchExperimentSource;
}

export type MarketResearchExperimentThesis =
  | 'TREND_FLIP_DIRECTIONAL'
  | 'ALIGNED_CONTINUATION'
  | 'LEADERSHIP_BREAKOUT'
  | 'DIVERGENCE_RESOLUTION';

export type MarketResearchExperimentSource = 'TREND_FLIP' | 'PROACTIVE';

export interface MarketResearchExperiment extends MarketResearchPredictionEpisode {
  id: string;
  thesis: MarketResearchExperimentThesis;
  thesisSummary: string;
  source: MarketResearchExperimentSource;
  horizonMinutes: number;
  evidence: string[];
  evaluationMode: 'ALL_SYMBOLS' | 'PRIMARY_SYMBOL';
}

export interface MarketResearchInsight {
  kind: 'EXPERIMENT_OPENED' | 'EXPERIMENT_EVALUATED';
  at: string;
  thesis: MarketResearchExperimentThesis;
  direction: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>;
  symbol?: SymbolCode;
  outcome?: 'WIN' | 'LOSS';
  headline: string;
  detail: string;
}

export interface MarketResearchThesisPerformanceSummary {
  thesis: MarketResearchExperimentThesis;
  label: string;
  total: number;
  open: number;
  evaluated: number;
  wins: number;
  losses: number;
  hitRate: number;
  averageConfidence: number;
  lastOpenedAt?: string;
  lastEvaluatedAt?: string;
  lastOutcome?: 'WIN' | 'LOSS';
}

export interface MarketResearchKnowledgeBaseSummary {
  totalExperiments: number;
  openExperiments: number;
  evaluatedExperiments: number;
  hitRate: number;
  proactiveHitRate: number;
  bestThesis?: MarketResearchThesisPerformanceSummary;
  thesisPerformance: MarketResearchThesisPerformanceSummary[];
  activeHypotheses: MarketResearchExperiment[];
  recentInsights: MarketResearchInsight[];
}

export interface MarketResearchPerformanceSummary {
  evaluationMinutes: number;
  totalPredictions: number;
  openPredictions: number;
  evaluatedPredictions: number;
  winningPredictions: number;
  losingPredictions: number;
  hitRate: number;
  proactiveExperiments: number;
  evaluatedProactiveExperiments: number;
  proactiveHitRate: number;
  adaptiveHitRate: number;
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
    statePath?: string;
    bootstrapRecursive: boolean;
    maxBarsPerSymbol: number;
    focusSymbols: SymbolCode[];
    analysisTimeframes: Array<Extract<Timeframe, '5m' | '15m' | '1H'>>;
    proactiveMinConfidence: number;
    experimentCooldownMinutes: number;
    maxExperiments: number;
  };
  performance: MarketResearchPerformanceSummary;
  knowledgeBase: MarketResearchKnowledgeBaseSummary;
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
  statePath?: string;
  bootstrapRecursive: boolean;
  maxBarsPerSymbol: number;
  focusSymbols: SymbolCode[];
  flipNotificationMinConfidence?: number;
  evaluationMinutes?: number;
  proactiveMinConfidence?: number;
  experimentCooldownMinutes?: number;
  maxExperiments?: number;
  maxInsights?: number;
  onTrendFlip?: (event: MarketResearchTrendFlipEvent) => Promise<void> | void;
}

const ANALYSIS_TIMEFRAMES: Array<Extract<Timeframe, '5m' | '15m' | '1H'>> = ['5m', '15m', '1H'];
const MAX_RECENT_RESEARCH_ITEMS = 6;
const DEFAULT_MAX_EXPERIMENTS = 160;
const DEFAULT_MAX_INSIGHTS = 48;

interface MarketResearchPersistedState {
  experiments: MarketResearchExperiment[];
  insights: MarketResearchInsight[];
}

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

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const isDirectionalResearchTrend = (
  value: ResearchTrendDirection
): value is Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'> => value === 'BULLISH' || value === 'BEARISH';

const thesisLabel = (thesis: MarketResearchExperimentThesis): string => {
  if (thesis === 'TREND_FLIP_DIRECTIONAL') {
    return 'Trend Flip';
  }
  if (thesis === 'ALIGNED_CONTINUATION') {
    return 'Aligned Continuation';
  }
  if (thesis === 'LEADERSHIP_BREAKOUT') {
    return 'Leadership Breakout';
  }
  return 'Divergence Resolution';
};

const thesisHorizonMinutes = (
  thesis: MarketResearchExperimentThesis,
  evaluationMinutes: number
): number => {
  if (thesis === 'LEADERSHIP_BREAKOUT') {
    return Math.max(30, Math.round(evaluationMinutes * 0.75));
  }
  if (thesis === 'DIVERGENCE_RESOLUTION') {
    return Math.max(45, Math.round(evaluationMinutes * 1.25));
  }
  return evaluationMinutes;
};

const normalizeIsoTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    return undefined;
  }
  return new Date(ms).toISOString();
};

const normalizeSymbol = (value: unknown): SymbolCode | undefined => (value === 'NQ' || value === 'ES' ? value : undefined);

const normalizeDirectionalOutcome = (value: unknown): 'WIN' | 'LOSS' | undefined =>
  value === 'WIN' || value === 'LOSS' ? value : undefined;

const normalizeDirectionalTrend = (
  value: unknown
): Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'> | undefined => (value === 'BULLISH' || value === 'BEARISH' ? value : undefined);

const normalizeMoveBySymbol = (value: unknown): Partial<Record<SymbolCode, number>> => {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const candidate = value as Partial<Record<SymbolCode, unknown>>;
  const normalized: Partial<Record<SymbolCode, number>> = {};
  for (const symbol of ['NQ', 'ES'] as const) {
    const move = candidate[symbol];
    if (typeof move === 'number' && Number.isFinite(move)) {
      normalized[symbol] = round(move, 2);
    }
  }
  return normalized;
};

const normalizeExperiment = (value: unknown): MarketResearchExperiment | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<MarketResearchExperiment>;
  const id = typeof candidate.id === 'string' && candidate.id.trim().length > 0 ? candidate.id.trim() : undefined;
  const thesis =
    candidate.thesis === 'TREND_FLIP_DIRECTIONAL'
      || candidate.thesis === 'ALIGNED_CONTINUATION'
      || candidate.thesis === 'LEADERSHIP_BREAKOUT'
      || candidate.thesis === 'DIVERGENCE_RESOLUTION'
      ? candidate.thesis
      : undefined;
  const source = candidate.source === 'TREND_FLIP' || candidate.source === 'PROACTIVE' ? candidate.source : undefined;
  const direction = normalizeDirectionalTrend(candidate.direction);
  const openedAt = normalizeIsoTimestamp(candidate.openedAt);
  if (!id || !thesis || !source || !direction || !openedAt) {
    return null;
  }

  const thesisSummary =
    typeof candidate.thesisSummary === 'string' && candidate.thesisSummary.trim().length > 0
      ? candidate.thesisSummary.trim()
      : thesisLabel(thesis);
  const confidence = typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)
    ? clamp(candidate.confidence, 0, 1)
    : 0;
  const evaluatedAt = normalizeIsoTimestamp(candidate.evaluatedAt);
  const horizonMinutes =
    typeof candidate.horizonMinutes === 'number' && Number.isFinite(candidate.horizonMinutes)
      ? Math.max(5, Math.round(candidate.horizonMinutes))
      : 60;
  const evaluationMode =
    candidate.evaluationMode === 'PRIMARY_SYMBOL' || candidate.evaluationMode === 'ALL_SYMBOLS'
      ? candidate.evaluationMode
      : 'ALL_SYMBOLS';

  return {
    id,
    thesis,
    thesisSummary,
    source,
    direction,
    openedAt,
    evaluatedAt,
    leadSymbol: normalizeSymbol(candidate.leadSymbol),
    symbol: normalizeSymbol(candidate.symbol),
    confidence: round(confidence, 2),
    outcome: normalizeDirectionalOutcome(candidate.outcome),
    moveBySymbol: normalizeMoveBySymbol(candidate.moveBySymbol),
    horizonMinutes,
    evidence: Array.isArray(candidate.evidence)
      ? candidate.evidence.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 6)
      : [],
    evaluationMode
  };
};

const normalizeInsight = (value: unknown): MarketResearchInsight | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<MarketResearchInsight>;
  const kind =
    candidate.kind === 'EXPERIMENT_OPENED' || candidate.kind === 'EXPERIMENT_EVALUATED' ? candidate.kind : undefined;
  const thesis =
    candidate.thesis === 'TREND_FLIP_DIRECTIONAL'
      || candidate.thesis === 'ALIGNED_CONTINUATION'
      || candidate.thesis === 'LEADERSHIP_BREAKOUT'
      || candidate.thesis === 'DIVERGENCE_RESOLUTION'
      ? candidate.thesis
      : undefined;
  const direction = normalizeDirectionalTrend(candidate.direction);
  const at = normalizeIsoTimestamp(candidate.at);
  const headline = typeof candidate.headline === 'string' && candidate.headline.trim().length > 0 ? candidate.headline.trim() : undefined;
  const detail = typeof candidate.detail === 'string' && candidate.detail.trim().length > 0 ? candidate.detail.trim() : undefined;

  if (!kind || !thesis || !direction || !at || !headline || !detail) {
    return null;
  }

  return {
    kind,
    thesis,
    direction,
    at,
    symbol: normalizeSymbol(candidate.symbol),
    outcome: normalizeDirectionalOutcome(candidate.outcome),
    headline,
    detail
  };
};

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
  proactiveExperiments: 0,
  evaluatedProactiveExperiments: 0,
  proactiveHitRate: 0,
  adaptiveHitRate: 0,
  recentEpisodes: []
});

const defaultKnowledgeBaseSummary = (): MarketResearchKnowledgeBaseSummary => ({
  totalExperiments: 0,
  openExperiments: 0,
  evaluatedExperiments: 0,
  hitRate: 0,
  proactiveHitRate: 0,
  thesisPerformance: [],
  activeHypotheses: [],
  recentInsights: []
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
  private experiments: MarketResearchExperiment[] = [];
  private insights: MarketResearchInsight[] = [];
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly config: MarketResearchConfig) {}

  private get evaluationMinutes(): number {
    return this.config.evaluationMinutes ?? 60;
  }

  private get proactiveMinConfidence(): number {
    return this.config.proactiveMinConfidence ?? 0.64;
  }

  private get experimentCooldownMinutes(): number {
    return this.config.experimentCooldownMinutes ?? 45;
  }

  private get maxExperiments(): number {
    return this.config.maxExperiments ?? DEFAULT_MAX_EXPERIMENTS;
  }

  private get maxInsights(): number {
    return this.config.maxInsights ?? DEFAULT_MAX_INSIGHTS;
  }

  private buildPerformanceSummary(): MarketResearchPerformanceSummary {
    if (this.experiments.length === 0) {
      return defaultPerformanceSummary(this.evaluationMinutes);
    }
    const evaluatedPredictions = this.experiments.filter((episode) => episode.outcome);
    const winningPredictions = evaluatedPredictions.filter((episode) => episode.outcome === 'WIN').length;
    const losingPredictions = evaluatedPredictions.filter((episode) => episode.outcome === 'LOSS').length;
    const proactiveExperiments = this.experiments.filter((episode) => episode.source === 'PROACTIVE');
    const evaluatedProactiveExperiments = proactiveExperiments.filter((episode) => episode.outcome);
    const proactiveWins = evaluatedProactiveExperiments.filter((episode) => episode.outcome === 'WIN').length;
    const lastEvaluatedEpisode = evaluatedPredictions
      .slice()
      .sort((left, right) => (right.evaluatedAt ?? '').localeCompare(left.evaluatedAt ?? ''))[0];
    const hitRate =
      evaluatedPredictions.length > 0 ? round(winningPredictions / evaluatedPredictions.length, 2) : 0;
    const proactiveHitRate =
      evaluatedProactiveExperiments.length > 0 ? round(proactiveWins / evaluatedProactiveExperiments.length, 2) : 0;
    const adaptiveHitRate =
      evaluatedProactiveExperiments.length > 0
        ? round(hitRate * 0.55 + proactiveHitRate * 0.45, 2)
        : hitRate;

    return {
      evaluationMinutes: this.evaluationMinutes,
      totalPredictions: this.experiments.length,
      openPredictions: this.experiments.length - evaluatedPredictions.length,
      evaluatedPredictions: evaluatedPredictions.length,
      winningPredictions,
      losingPredictions,
      hitRate,
      proactiveExperiments: proactiveExperiments.length,
      evaluatedProactiveExperiments: evaluatedProactiveExperiments.length,
      proactiveHitRate,
      adaptiveHitRate,
      lastEvaluatedAt: lastEvaluatedEpisode?.evaluatedAt,
      lastOutcome: lastEvaluatedEpisode?.outcome,
      recentEpisodes: this.experiments
        .slice(-MAX_RECENT_RESEARCH_ITEMS)
        .reverse()
        .map((episode) => ({
          ...episode,
          moveBySymbol: { ...episode.moveBySymbol }
        }))
    };
  }

  private buildKnowledgeBaseSummary(): MarketResearchKnowledgeBaseSummary {
    if (this.experiments.length === 0) {
      return defaultKnowledgeBaseSummary();
    }

    const evaluated = this.experiments.filter((experiment) => experiment.outcome);
    const proactive = this.experiments.filter((experiment) => experiment.source === 'PROACTIVE');
    const evaluatedProactive = proactive.filter((experiment) => experiment.outcome);
    const grouped = new Map<MarketResearchExperimentThesis, MarketResearchExperiment[]>();
    for (const experiment of this.experiments) {
      const existing = grouped.get(experiment.thesis) ?? [];
      existing.push(experiment);
      grouped.set(experiment.thesis, existing);
    }

    const thesisPerformance = Array.from(grouped.entries())
      .map(([thesis, experiments]) => {
        const evaluatedExperiments = experiments.filter((experiment) => experiment.outcome);
        const wins = evaluatedExperiments.filter((experiment) => experiment.outcome === 'WIN').length;
        const losses = evaluatedExperiments.length - wins;
        const lastOpened = experiments
          .slice()
          .sort((left, right) => right.openedAt.localeCompare(left.openedAt))[0];
        const lastEvaluated = evaluatedExperiments
          .slice()
          .sort((left, right) => (right.evaluatedAt ?? '').localeCompare(left.evaluatedAt ?? ''))[0];

        return {
          thesis,
          label: thesisLabel(thesis),
          total: experiments.length,
          open: experiments.length - evaluatedExperiments.length,
          evaluated: evaluatedExperiments.length,
          wins,
          losses,
          hitRate: evaluatedExperiments.length > 0 ? round(wins / evaluatedExperiments.length, 2) : 0,
          averageConfidence: round(average(experiments.map((experiment) => experiment.confidence)), 2),
          lastOpenedAt: lastOpened?.openedAt,
          lastEvaluatedAt: lastEvaluated?.evaluatedAt,
          lastOutcome: lastEvaluated?.outcome
        } satisfies MarketResearchThesisPerformanceSummary;
      })
      .sort((left, right) => {
        if (right.evaluated !== left.evaluated) {
          return right.evaluated - left.evaluated;
        }
        if (right.hitRate !== left.hitRate) {
          return right.hitRate - left.hitRate;
        }
        return right.total - left.total;
      });

    const bestThesis = thesisPerformance.find((item) => item.evaluated >= 2) ?? thesisPerformance[0];
    const evaluatedWins = evaluated.filter((experiment) => experiment.outcome === 'WIN').length;
    const proactiveWins = evaluatedProactive.filter((experiment) => experiment.outcome === 'WIN').length;

    return {
      totalExperiments: this.experiments.length,
      openExperiments: this.experiments.length - evaluated.length,
      evaluatedExperiments: evaluated.length,
      hitRate: evaluated.length > 0 ? round(evaluatedWins / evaluated.length, 2) : 0,
      proactiveHitRate: evaluatedProactive.length > 0 ? round(proactiveWins / evaluatedProactive.length, 2) : 0,
      bestThesis,
      thesisPerformance: thesisPerformance.slice(0, 4),
      activeHypotheses: this.experiments
        .filter((experiment) => !experiment.outcome)
        .slice(-MAX_RECENT_RESEARCH_ITEMS)
        .reverse()
        .map((experiment) => ({
          ...experiment,
          evidence: [...experiment.evidence],
          moveBySymbol: { ...experiment.moveBySymbol }
        })),
      recentInsights: this.insights
        .slice(-MAX_RECENT_RESEARCH_ITEMS)
        .reverse()
        .map((insight) => ({ ...insight }))
    };
  }

  private buildEntryPrices(symbolStatuses: MarketResearchSymbolStatus[]): Partial<Record<SymbolCode, number>> {
    return Object.fromEntries(
      symbolStatuses
        .filter((status) => typeof status.latestPrice === 'number')
        .map((status) => [status.symbol, status.latestPrice as number])
    ) as Partial<Record<SymbolCode, number>>;
  }

  private appendInsight(insight: MarketResearchInsight): void {
    this.insights.push(insight);
    if (this.insights.length > this.maxInsights) {
      this.insights = this.insights.slice(-this.maxInsights);
    }
  }

  private trimExperimentHistory(): void {
    if (this.experiments.length > this.maxExperiments) {
      this.experiments = this.experiments.slice(-this.maxExperiments);
    }
  }

  private canOpenExperiment(
    thesis: MarketResearchExperimentThesis,
    direction: Extract<ResearchTrendDirection, 'BULLISH' | 'BEARISH'>,
    symbol: SymbolCode | undefined,
    openedAt: string
  ): boolean {
    const openedAtMs = Date.parse(openedAt);
    const cooldownMs = this.experimentCooldownMinutes * 60_000;
    return !this.experiments.some((experiment) => {
      if (experiment.thesis !== thesis || experiment.direction !== direction || experiment.symbol !== symbol) {
        return false;
      }
      if (!experiment.outcome) {
        return true;
      }
      return openedAtMs - Date.parse(experiment.openedAt) < cooldownMs;
    });
  }

  private openExperiment(candidate: Omit<MarketResearchExperiment, 'id'>): boolean {
    if (!this.canOpenExperiment(candidate.thesis, candidate.direction, candidate.symbol, candidate.openedAt)) {
      return false;
    }

    const experiment: MarketResearchExperiment = {
      ...candidate,
      id: `${candidate.openedAt}|${candidate.thesis}|${candidate.symbol ?? candidate.leadSymbol ?? 'market'}`
    };
    this.experiments.push(experiment);
    this.trimExperimentHistory();
    this.appendInsight({
      kind: 'EXPERIMENT_OPENED',
      at: candidate.openedAt,
      thesis: candidate.thesis,
      direction: candidate.direction,
      symbol: candidate.symbol,
      headline: `${thesisLabel(candidate.thesis)} opened ${candidate.direction.toLowerCase()}.`,
      detail: candidate.thesisSummary
    });
    return true;
  }

  private maybeOpenPrediction(
    previousTrend: MarketResearchOverallTrend,
    nextTrend: MarketResearchOverallTrend,
    symbolStatuses: MarketResearchSymbolStatus[],
    changedAt: string
  ): boolean {
    if (!isDirectionalResearchTrend(nextTrend.direction)) {
      return false;
    }
    if (previousTrend.direction === nextTrend.direction) {
      return false;
    }

    return this.openExperiment({
      thesis: 'TREND_FLIP_DIRECTIONAL',
      thesisSummary: `The autonomous trend flipped ${nextTrend.direction.toLowerCase()} and is tracking whether that directional change follows through.`,
      source: 'TREND_FLIP',
      direction: nextTrend.direction,
      openedAt: changedAt,
      leadSymbol: nextTrend.leadSymbol,
      symbol: nextTrend.leadSymbol,
      confidence: nextTrend.confidence,
      moveBySymbol: this.buildEntryPrices(symbolStatuses),
      horizonMinutes: thesisHorizonMinutes('TREND_FLIP_DIRECTIONAL', this.evaluationMinutes),
      evidence: takeLast(nextTrend.reasons, 3),
      evaluationMode: 'ALL_SYMBOLS'
    });
  }

  private maybeOpenProactiveExperiments(
    nextTrend: MarketResearchOverallTrend,
    symbolStatuses: MarketResearchSymbolStatus[],
    changedAt: string
  ): boolean {
    let opened = false;
    const leadStatus = nextTrend.leadSymbol
      ? symbolStatuses.find((status) => status.symbol === nextTrend.leadSymbol)
      : undefined;

    if (isDirectionalResearchTrend(nextTrend.direction) && nextTrend.aligned && nextTrend.confidence >= this.proactiveMinConfidence) {
      opened =
        this.openExperiment({
          thesis: 'ALIGNED_CONTINUATION',
          thesisSummary: `${nextTrend.direction === 'BULLISH' ? 'Bullish' : 'Bearish'} continuation experiment while NQ and ES are aligned across the research stack.`,
          source: 'PROACTIVE',
          direction: nextTrend.direction,
          openedAt: changedAt,
          leadSymbol: nextTrend.leadSymbol,
          confidence: nextTrend.confidence,
          moveBySymbol: this.buildEntryPrices(symbolStatuses),
          horizonMinutes: thesisHorizonMinutes('ALIGNED_CONTINUATION', this.evaluationMinutes),
          evidence: [
            nextTrend.reason,
            ...symbolStatuses.flatMap((status) => takeLast(status.reasons, 1))
          ].slice(0, 4),
          evaluationMode: 'ALL_SYMBOLS'
        }) || opened;
    }

    if (
      isDirectionalResearchTrend(nextTrend.direction)
      && !nextTrend.aligned
      && leadStatus
      && leadStatus.direction === nextTrend.direction
      && leadStatus.confidence >= this.proactiveMinConfidence
      && Math.abs(leadStatus.compositeScore) >= 1.15
    ) {
      opened =
        this.openExperiment({
          thesis: 'LEADERSHIP_BREAKOUT',
          thesisSummary: `${leadStatus.symbol} is leading a ${nextTrend.direction.toLowerCase()} breakout before full breadth confirms.`,
          source: 'PROACTIVE',
          direction: nextTrend.direction,
          openedAt: changedAt,
          leadSymbol: leadStatus.symbol,
          symbol: leadStatus.symbol,
          confidence: leadStatus.confidence,
          moveBySymbol: this.buildEntryPrices(symbolStatuses),
          horizonMinutes: thesisHorizonMinutes('LEADERSHIP_BREAKOUT', this.evaluationMinutes),
          evidence: [leadStatus.reason, ...takeLast(leadStatus.reasons, 2)],
          evaluationMode: 'PRIMARY_SYMBOL'
        }) || opened;
    }

    if (nextTrend.direction === 'STAND_ASIDE' && symbolStatuses.length >= 2) {
      const [lead, lag] = symbolStatuses.slice().sort((left, right) => Math.abs(right.compositeScore) - Math.abs(left.compositeScore));
      if (
        lead
        && lag
        && lead.direction !== 'BALANCED'
        && lag.direction !== 'BALANCED'
        && lead.direction !== lag.direction
        && lead.confidence >= this.proactiveMinConfidence
        && Math.abs(lead.compositeScore) - Math.abs(lag.compositeScore) >= 0.45
      ) {
        opened =
          this.openExperiment({
            thesis: 'DIVERGENCE_RESOLUTION',
            thesisSummary: `${lead.symbol} is leading the divergence. The experiment tracks whether the tape resolves in ${lead.symbol}'s ${lead.direction.toLowerCase()} direction.`,
            source: 'PROACTIVE',
            direction: lead.direction,
            openedAt: changedAt,
            leadSymbol: lead.symbol,
            symbol: lead.symbol,
            confidence: lead.confidence,
            moveBySymbol: this.buildEntryPrices(symbolStatuses),
            horizonMinutes: thesisHorizonMinutes('DIVERGENCE_RESOLUTION', this.evaluationMinutes),
            evidence: [nextTrend.reason, lead.reason, lag.reason],
            evaluationMode: 'PRIMARY_SYMBOL'
          }) || opened;
      }
    }

    return opened;
  }

  private evaluateExperiments(changedAt: string, symbolStatuses: MarketResearchSymbolStatus[]): boolean {
    const nowMs = Date.parse(changedAt);
    const latestPrices = new Map(
      symbolStatuses
        .filter((status) => typeof status.latestPrice === 'number')
        .map((status) => [status.symbol, status.latestPrice as number])
    );
    let changed = false;

    this.experiments = this.experiments.map((experiment) => {
      if (experiment.outcome || nowMs - Date.parse(experiment.openedAt) < experiment.horizonMinutes * 60_000) {
        return experiment;
      }

      const trackedSymbols =
        experiment.evaluationMode === 'PRIMARY_SYMBOL' && experiment.symbol
          ? [experiment.symbol]
          : (Object.keys(experiment.moveBySymbol) as SymbolCode[]);
      const directionalMoves = trackedSymbols
        .map((symbol) => {
          const entryPrice = experiment.moveBySymbol[symbol];
          const latestPrice = latestPrices.get(symbol);
          if (entryPrice === undefined || latestPrice === undefined) {
            return undefined;
          }
          const rawMove = latestPrice - entryPrice;
          return {
            symbol,
            move: experiment.direction === 'BULLISH' ? rawMove : -rawMove,
            rawMove
          };
        })
        .filter(
          (value): value is { symbol: SymbolCode; move: number; rawMove: number } => typeof value?.move === 'number'
        );

      if (directionalMoves.length === 0) {
        return experiment;
      }

      changed = true;
      const wins = directionalMoves.filter((value) => value.move > 0).length;
      const losses = directionalMoves.length - wins;
      const aggregateMove = directionalMoves.reduce((sum, value) => sum + value.move, 0);
      const outcome = wins === losses ? (aggregateMove > 0 ? 'WIN' : 'LOSS') : wins > losses ? 'WIN' : 'LOSS';
      const updatedMoveBySymbol = Object.fromEntries(
        directionalMoves.map((value) => [value.symbol, round(value.rawMove, 2)])
      ) as Partial<Record<SymbolCode, number>>;

      this.appendInsight({
        kind: 'EXPERIMENT_EVALUATED',
        at: changedAt,
        thesis: experiment.thesis,
        direction: experiment.direction,
        symbol: experiment.symbol,
        outcome,
        headline: `${thesisLabel(experiment.thesis)} ${outcome === 'WIN' ? 'worked' : 'failed'}.`,
        detail: `${experiment.thesisSummary} Outcome after ${experiment.horizonMinutes}m: ${outcome}.`
      });

      return {
        ...experiment,
        evaluatedAt: changedAt,
        outcome,
        moveBySymbol: updatedMoveBySymbol
      };
    });

    return changed;
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

    const openedTrendFlipExperiment = this.maybeOpenPrediction(previousTrend, nextTrend, symbols, changedAt);
    const openedProactiveExperiments = this.maybeOpenProactiveExperiments(nextTrend, symbols, changedAt);
    const evaluatedExperiments = this.evaluateExperiments(changedAt, symbols);
    const researchBookChanged = openedTrendFlipExperiment || openedProactiveExperiments || evaluatedExperiments;

    this.symbolStatuses = symbols;
    this.overallTrend = nextTrend;
    this.lastComputedAt = changedAt;
    this.initialComputeComplete = true;

    if (researchBookChanged) {
      await this.persistState();
    }

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

  private async loadPersistedState(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }

    try {
      const raw = await fs.readFile(this.config.statePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<MarketResearchPersistedState>;
      this.experiments = Array.isArray(parsed.experiments)
        ? parsed.experiments.map((item) => normalizeExperiment(item)).filter((item): item is MarketResearchExperiment => item !== null)
        : [];
      this.insights = Array.isArray(parsed.insights)
        ? parsed.insights.map((item) => normalizeInsight(item)).filter((item): item is MarketResearchInsight => item !== null)
        : [];
      this.trimExperimentHistory();
      if (this.insights.length > this.maxInsights) {
        this.insights = this.insights.slice(-this.maxInsights);
      }
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.lastError = err.message;
      }
      this.experiments = [];
      this.insights = [];
    }
  }

  private async persistState(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }

    const snapshot: MarketResearchPersistedState = {
      experiments: this.experiments.map((experiment) => ({
        ...experiment,
        evidence: [...experiment.evidence],
        moveBySymbol: { ...experiment.moveBySymbol }
      })),
      insights: this.insights.map((insight) => ({ ...insight }))
    };

    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.config.statePath as string), { recursive: true });
      await fs.writeFile(this.config.statePath as string, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    });
    await this.writeChain;
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
      await this.loadPersistedState();
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
        statePath: this.config.statePath,
        bootstrapRecursive: this.config.bootstrapRecursive,
        maxBarsPerSymbol: this.config.maxBarsPerSymbol,
        focusSymbols: [...this.config.focusSymbols],
        analysisTimeframes: [...ANALYSIS_TIMEFRAMES],
        proactiveMinConfidence: this.proactiveMinConfidence,
        experimentCooldownMinutes: this.experimentCooldownMinutes,
        maxExperiments: this.maxExperiments
      },
      performance: this.buildPerformanceSummary(),
      knowledgeBase: this.buildKnowledgeBaseSummary()
    };
  }
}
