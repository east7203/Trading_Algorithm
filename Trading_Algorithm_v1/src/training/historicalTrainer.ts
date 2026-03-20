import type { Candle, SetupCandidate, SetupType, SignalGenerationInput, SymbolCode } from '../domain/types.js';
import { generateSetupCandidates } from '../domain/setupDetectors.js';
import { rankCandidates } from '../services/ranker.js';
import { defaultRankingModel, emptySetupAdjustments, type RankingModel } from '../services/rankingModel.js';

export interface OneMinuteBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  symbol: SymbolCode;
}

export type TrainingOutcome = 'WIN' | 'LOSS';

export interface TrainingExample {
  snapshotId: string;
  candidate: SetupCandidate;
  outcome: TrainingOutcome;
}

export interface TrainingBuildOptions {
  timezone?: string;
  sessionStartHour?: number;
  sessionStartMinute?: number;
  sessionEndHour?: number;
  sessionEndMinute?: number;
  nyRangeMinutes?: number;
  lookbackBars1m?: number;
  lookaheadBars1m?: number;
  stepBars?: number;
}

export interface TopPickWinRate {
  topPickCount: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface TrainedModelResult {
  model: RankingModel;
  examples: TrainingExample[];
  baselineTopPick: TopPickWinRate;
  trainedTopPick: TopPickWinRate;
}

const DEFAULT_OPTIONS: Required<TrainingBuildOptions> = {
  timezone: 'America/New_York',
  sessionStartHour: 8,
  sessionStartMinute: 30,
  sessionEndHour: 11,
  sessionEndMinute: 30,
  nyRangeMinutes: 60,
  lookbackBars1m: 240,
  lookaheadBars1m: 120,
  stepBars: 5
};

const symbolAliases: Record<string, SymbolCode> = {
  NAS100: 'NAS100',
  US30: 'US30',
  NQ: 'NQ',
  ES: 'ES',
  YM: 'YM',
  MNQ: 'MNQ',
  MYM: 'MYM',
  SPY: 'ES',
  SPX: 'ES',
  GSPC: 'ES',
  '^GSPC': 'ES',
  US500: 'ES',
  USTEC: 'NAS100',
  US100: 'NAS100',
  DJ30: 'US30',
  DJI: 'US30'
};

const knownSymbols = new Set<SymbolCode>(['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM']);

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toNumberOrThrow = (value: string, column: string, lineNumber: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${column} on line ${lineNumber}`);
  }
  return parsed;
};

const normalizeSymbolOrThrow = (raw: string | undefined, fallback?: SymbolCode): SymbolCode => {
  if (fallback) {
    return fallback;
  }
  if (!raw) {
    throw new Error('CSV is missing symbol column and no --symbol override was provided');
  }
  const normalized = symbolAliases[raw.trim().toUpperCase()];
  if (!normalized) {
    throw new Error(`Unsupported symbol "${raw}"`);
  }
  return normalized;
};

interface LocalTimeParts {
  dayKey: string;
  minuteOfDay: number;
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
  const find = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((p) => p.type === type);
    return part ? part.value : '00';
  };
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

const inWindow = (minuteOfDay: number, startMinute: number, endMinute: number): boolean =>
  minuteOfDay >= startMinute && minuteOfDay <= endMinute;

const barToCandle = (bar: OneMinuteBar): Candle => ({
  timestamp: bar.timestamp,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume
});

export const parseOneMinuteCsv = (csv: string, symbolOverride?: SymbolCode): OneMinuteBar[] => {
  if (symbolOverride && !knownSymbols.has(symbolOverride)) {
    throw new Error(`Unsupported symbol override "${symbolOverride}"`);
  }

  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error('CSV requires a header and at least one data row');
  }

  const headers = lines[0].split(',').map((header) => header.trim().toLowerCase());
  const indexOf = (names: string[]): number => headers.findIndex((header) => names.includes(header));

  const timestampIdx = indexOf(['timestamp', 'time', 'date', 'datetime', 'ts_event']);
  const openIdx = indexOf(['open', 'o']);
  const highIdx = indexOf(['high', 'h']);
  const lowIdx = indexOf(['low', 'l']);
  const closeIdx = indexOf(['close', 'c']);
  const volumeIdx = indexOf(['volume', 'v']);
  const symbolIdx = indexOf(['symbol', 'ticker', 'instrument']);

  if (timestampIdx < 0 || openIdx < 0 || highIdx < 0 || lowIdx < 0 || closeIdx < 0) {
    throw new Error('CSV must contain timestamp, open, high, low, close columns');
  }

  const bars: OneMinuteBar[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const row = lines[i];
    const cols = row.split(',').map((col) => col.trim());
    const lineNumber = i + 1;

    if (cols.length < headers.length) {
      continue;
    }

    const timestampRaw = cols[timestampIdx];
    const parsedTimestamp = Date.parse(timestampRaw);
    if (Number.isNaN(parsedTimestamp)) {
      throw new Error(`Invalid timestamp on line ${lineNumber}`);
    }
    const timestamp = new Date(parsedTimestamp).toISOString();

    const symbol = normalizeSymbolOrThrow(symbolIdx >= 0 ? cols[symbolIdx] : undefined, symbolOverride);

    bars.push({
      timestamp,
      open: toNumberOrThrow(cols[openIdx], 'open', lineNumber),
      high: toNumberOrThrow(cols[highIdx], 'high', lineNumber),
      low: toNumberOrThrow(cols[lowIdx], 'low', lineNumber),
      close: toNumberOrThrow(cols[closeIdx], 'close', lineNumber),
      volume: volumeIdx >= 0 && cols[volumeIdx] !== '' ? toNumberOrThrow(cols[volumeIdx], 'volume', lineNumber) : undefined,
      symbol
    });
  }

  return bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

export const aggregateBars = (bars: OneMinuteBar[], intervalMinutes: number): Candle[] => {
  if (bars.length === 0) {
    return [];
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  const candles: Candle[] = [];

  let bucketStart = 0;
  let open = 0;
  let high = 0;
  let low = 0;
  let close = 0;
  let volume = 0;
  let hasVolume = false;

  const flush = () => {
    candles.push({
      timestamp: new Date(bucketStart).toISOString(),
      open,
      high,
      low,
      close,
      volume: hasVolume ? volume : undefined
    });
  };

  bars.forEach((bar, index) => {
    const ms = Date.parse(bar.timestamp);
    const start = Math.floor(ms / intervalMs) * intervalMs;

    if (index === 0) {
      bucketStart = start;
      open = bar.open;
      high = bar.high;
      low = bar.low;
      close = bar.close;
      volume = bar.volume ?? 0;
      hasVolume = typeof bar.volume === 'number';
      return;
    }

    if (start !== bucketStart) {
      flush();
      bucketStart = start;
      open = bar.open;
      high = bar.high;
      low = bar.low;
      close = bar.close;
      volume = bar.volume ?? 0;
      hasVolume = typeof bar.volume === 'number';
      return;
    }

    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
    close = bar.close;
    if (typeof bar.volume === 'number') {
      hasVolume = true;
      volume += bar.volume;
    }
  });

  flush();
  return candles;
};

export const labelCandidateFromFutureCandles5m = (
  candidate: SetupCandidate,
  futureCandles5m: Candle[]
): TrainingOutcome | null => {
  const target = candidate.takeProfit[0];
  if (typeof target !== 'number') {
    return null;
  }

  for (const candle of futureCandles5m) {
    if (candidate.side === 'LONG') {
      const stopHit = candle.low <= candidate.stopLoss;
      const targetHit = candle.high >= target;
      if (stopHit && targetHit) {
        return 'LOSS';
      }
      if (targetHit) {
        return 'WIN';
      }
      if (stopHit) {
        return 'LOSS';
      }
    } else {
      const stopHit = candle.high >= candidate.stopLoss;
      const targetHit = candle.low <= target;
      if (stopHit && targetHit) {
        return 'LOSS';
      }
      if (targetHit) {
        return 'WIN';
      }
      if (stopHit) {
        return 'LOSS';
      }
    }
  }

  return null;
};

const mergeOptions = (options: TrainingBuildOptions): Required<TrainingBuildOptions> => ({
  ...DEFAULT_OPTIONS,
  ...options
});

interface SessionState {
  count: number;
  high: number;
  low: number;
  rangeCount: number;
  rangeHigh: number;
  rangeLow: number;
}

interface CandleFrameWindow {
  candles: Candle[];
  endExclusive: number;
  startInclusive: number;
}

const buildSessionStates = (
  bars: OneMinuteBar[],
  localParts: LocalTimeParts[],
  sessionStart: number,
  sessionEnd: number,
  rangeEnd: number
): SessionState[] => {
  const states: SessionState[] = [];

  let currentDay = '';
  let sessionCount = 0;
  let sessionHigh = 0;
  let sessionLow = 0;
  let rangeCount = 0;
  let rangeHigh = 0;
  let rangeLow = 0;

  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    const local = localParts[i];

    if (local.dayKey !== currentDay) {
      currentDay = local.dayKey;
      sessionCount = 0;
      sessionHigh = 0;
      sessionLow = 0;
      rangeCount = 0;
      rangeHigh = 0;
      rangeLow = 0;
    }

    if (inWindow(local.minuteOfDay, sessionStart, sessionEnd)) {
      if (sessionCount === 0) {
        sessionHigh = bar.high;
        sessionLow = bar.low;
      } else {
        sessionHigh = Math.max(sessionHigh, bar.high);
        sessionLow = Math.min(sessionLow, bar.low);
      }
      sessionCount += 1;

      if (local.minuteOfDay <= rangeEnd) {
        if (rangeCount === 0) {
          rangeHigh = bar.high;
          rangeLow = bar.low;
        } else {
          rangeHigh = Math.max(rangeHigh, bar.high);
          rangeLow = Math.min(rangeLow, bar.low);
        }
        rangeCount += 1;
      }
    }

    states.push({
      count: sessionCount,
      high: sessionHigh,
      low: sessionLow,
      rangeCount,
      rangeHigh,
      rangeLow
    });
  }

  return states;
};

const advanceFrameWindow = (
  frame: CandleFrameWindow,
  nowTimestamp: string,
  minTimestamp: string
): Candle[] => {
  while (
    frame.endExclusive < frame.candles.length &&
    frame.candles[frame.endExclusive].timestamp <= nowTimestamp
  ) {
    frame.endExclusive += 1;
  }

  while (
    frame.startInclusive < frame.endExclusive &&
    frame.candles[frame.startInclusive].timestamp < minTimestamp
  ) {
    frame.startInclusive += 1;
  }

  return frame.candles.slice(frame.startInclusive, frame.endExclusive);
};

const takeLast = (candles: Candle[], count: number): Candle[] =>
  candles.length <= count ? candles : candles.slice(candles.length - count);

export const buildTrainingExamplesFromOneMinuteBars = (
  bars: OneMinuteBar[],
  options: TrainingBuildOptions = {}
): TrainingExample[] => {
  const cfg = mergeOptions(options);
  const bySymbol = new Map<SymbolCode, OneMinuteBar[]>();

  for (const bar of bars) {
    const arr = bySymbol.get(bar.symbol);
    if (arr) {
      arr.push(bar);
    } else {
      bySymbol.set(bar.symbol, [bar]);
    }
  }

  const examples: TrainingExample[] = [];
  const sessionStart = cfg.sessionStartHour * 60 + cfg.sessionStartMinute;
  const sessionEnd = cfg.sessionEndHour * 60 + cfg.sessionEndMinute;
  const rangeEnd = sessionStart + cfg.nyRangeMinutes;

  for (const [symbol, symbolBars] of bySymbol.entries()) {
    const sorted = symbolBars.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const candles1mAll = sorted.map(barToCandle);
    const localParts = sorted.map((bar) => getLocalTimeParts(bar.timestamp, cfg.timezone));
    const sessionStates = buildSessionStates(sorted, localParts, sessionStart, sessionEnd, rangeEnd);

    const frame5m: CandleFrameWindow = {
      candles: aggregateBars(sorted, 5),
      startInclusive: 0,
      endExclusive: 0
    };
    const frame15m: CandleFrameWindow = {
      candles: aggregateBars(sorted, 15),
      startInclusive: 0,
      endExclusive: 0
    };
    const frame1H: CandleFrameWindow = {
      candles: aggregateBars(sorted, 60),
      startInclusive: 0,
      endExclusive: 0
    };
    const frame4H: CandleFrameWindow = {
      candles: aggregateBars(sorted, 240),
      startInclusive: 0,
      endExclusive: 0
    };
    const frameD1: CandleFrameWindow = {
      candles: aggregateBars(sorted, 1440),
      startInclusive: 0,
      endExclusive: 0
    };
    const frameW1: CandleFrameWindow = {
      candles: aggregateBars(sorted, 10080),
      startInclusive: 0,
      endExclusive: 0
    };

    for (
      let i = cfg.lookbackBars1m - 1;
      i < sorted.length - cfg.lookaheadBars1m;
      i += cfg.stepBars
    ) {
      const nowBar = sorted[i];
      const local = localParts[i];

      const inSession = inWindow(local.minuteOfDay, sessionStart, sessionEnd);
      if (!inSession) {
        continue;
      }

      const sessionState = sessionStates[i];
      if (sessionState.count < 30) {
        continue;
      }

      const lookback1m = sorted.slice(i - cfg.lookbackBars1m + 1, i + 1);
      const lookbackStartTimestamp = sorted[i - cfg.lookbackBars1m + 1].timestamp;
      const higherLookbackStart = Math.max(0, i - 8 * 7 * 24 * 60 + 1);
      const higherLookbackTimestamp = sorted[higherLookbackStart].timestamp;
      const candles1m = lookback1m.map(barToCandle);
      const candles5m = takeLast(advanceFrameWindow(frame5m, nowBar.timestamp, lookbackStartTimestamp), 20);
      const candles15m = takeLast(
        advanceFrameWindow(frame15m, nowBar.timestamp, lookbackStartTimestamp),
        20
      );
      const candles1H = takeLast(advanceFrameWindow(frame1H, nowBar.timestamp, higherLookbackTimestamp), 20);
      const candles4H = takeLast(advanceFrameWindow(frame4H, nowBar.timestamp, higherLookbackTimestamp), 20);
      const candlesD1 = takeLast(advanceFrameWindow(frameD1, nowBar.timestamp, higherLookbackTimestamp), 20);
      const candlesW1 = takeLast(advanceFrameWindow(frameW1, nowBar.timestamp, higherLookbackTimestamp), 20);

      if (candles5m.length < 3 || candles15m.length < 5) {
        continue;
      }

      const input: SignalGenerationInput = {
        symbol,
        session: 'NY',
        now: nowBar.timestamp,
        timeframeData: {
          '15m': candles15m,
          '5m': candles5m,
          '1m': candles1m,
          '1H': candles1H,
          '4H': candles4H,
          D1: candlesD1,
          W1: candlesW1
        },
        sessionLevels: {
          high: sessionState.high,
          low: sessionState.low,
          nyRangeHigh: sessionState.rangeCount > 0 ? sessionState.rangeHigh : sessionState.high,
          nyRangeLow: sessionState.rangeCount > 0 ? sessionState.rangeLow : sessionState.low
        }
      };

      const candidates = generateSetupCandidates(input);
      if (candidates.length === 0) {
        continue;
      }

      const future1m = sorted.slice(i + 1, i + 1 + cfg.lookaheadBars1m);
      const future5m = aggregateBars(future1m, 5);
      if (future5m.length === 0) {
        continue;
      }

      const snapshotId = `${symbol}-${nowBar.timestamp}`;
      candidates.forEach((candidate) => {
        const outcome = labelCandidateFromFutureCandles5m(candidate, future5m);
        if (!outcome) {
          return;
        }
        examples.push({
          snapshotId,
          candidate,
          outcome
        });
      });
    }
  }

  return examples;
};

const target = (example: TrainingExample): number => (example.outcome === 'WIN' ? 1 : 0);

export const evaluateTopPickWinRate = (
  examples: TrainingExample[],
  model: RankingModel
): TopPickWinRate => {
  const grouped = new Map<string, TrainingExample[]>();
  for (const example of examples) {
    const arr = grouped.get(example.snapshotId);
    if (arr) {
      arr.push(example);
    } else {
      grouped.set(example.snapshotId, [example]);
    }
  }

  let wins = 0;
  let losses = 0;

  for (const bucket of grouped.values()) {
    const candidates = bucket.map((example) => example.candidate);
    const ranked = rankCandidates({ candidates }, model);
    const top = ranked[0];
    if (!top) {
      continue;
    }

    const picked = bucket.find((example) => example.candidate.id === top.id);
    if (!picked) {
      continue;
    }

    if (picked.outcome === 'WIN') {
      wins += 1;
    } else {
      losses += 1;
    }
  }

  const total = wins + losses;
  return {
    topPickCount: total,
    wins,
    losses,
    winRate: total > 0 ? wins / total : 0
  };
};

export const trainRankingModelFromExamples = (examples: TrainingExample[]): RankingModel => {
  if (examples.length === 0) {
    throw new Error('No labeled examples were generated for training');
  }

  const defaults = defaultRankingModel();
  const setupAdjustments = emptySetupAdjustments();
  const symbols: SymbolCode[] = ['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM'];
  const symbolAdjustments: Partial<Record<SymbolCode, number>> = {};

  const targets = examples.map(target);
  const globalWinRate = average(targets);

  for (const setupType of Object.keys(setupAdjustments) as SetupType[]) {
    const setupExamples = examples.filter((example) => example.candidate.setupType === setupType);
    if (setupExamples.length === 0) {
      setupAdjustments[setupType] = 0;
      continue;
    }

    const setupWinRate = average(setupExamples.map(target));
    const shrink = setupExamples.length / (setupExamples.length + 20);
    setupAdjustments[setupType] = clamp((setupWinRate - globalWinRate) * 40 * shrink, -12, 12);
  }

  for (const symbol of symbols) {
    const symbolExamples = examples.filter((example) => example.candidate.symbol === symbol);
    if (symbolExamples.length === 0) {
      continue;
    }
    const symbolWinRate = average(symbolExamples.map(target));
    const shrink = symbolExamples.length / (symbolExamples.length + 25);
    symbolAdjustments[symbol] = clamp((symbolWinRate - globalWinRate) * 24 * shrink, -6, 6);
  }

  const centeredConfidence = examples.map((example) => example.candidate.oneMinuteConfidence - 0.5);
  const meanConfidence = average(centeredConfidence);
  const variance =
    centeredConfidence.reduce((sum, value) => sum + (value - meanConfidence) ** 2, 0) /
    centeredConfidence.length;
  const covariance =
    centeredConfidence.reduce((sum, value, idx) => sum + (value - meanConfidence) * (targets[idx] - globalWinRate), 0) /
    centeredConfidence.length;
  const slope = variance > 0 ? covariance / variance : 0;
  const confidenceWeight = clamp(defaults.confidenceWeight + slope * 18, 4, 24);

  const aiContext = examples.map((example) =>
    typeof example.candidate.metadata.aiContextScore === 'number'
      ? example.candidate.metadata.aiContextScore
      : 0
  );
  const meanAiContext = average(aiContext);
  const aiVariance =
    aiContext.reduce((sum, value) => sum + (value - meanAiContext) ** 2, 0) / aiContext.length;
  const aiCovariance =
    aiContext.reduce(
      (sum, value, idx) => sum + (value - meanAiContext) * (targets[idx] - globalWinRate),
      0
    ) / aiContext.length;
  const aiSlope = aiVariance > 0 ? aiCovariance / aiVariance : 0;
  const aiContextWeight = clamp(defaults.aiContextWeight + aiSlope * 6, 0, 8);
  const bias = clamp((globalWinRate - 0.5) * 8, -6, 6);

  return {
    version: 'v1',
    modelId: `ranking-model-${Date.now()}`,
    trainedAt: new Date().toISOString(),
    sampleCount: examples.length,
    globalWinRate,
    bias,
    confidenceWeight,
    aiContextWeight,
    setupAdjustments,
    symbolAdjustments
  };
};

export const trainRankingModelFromOneMinuteBars = (
  bars: OneMinuteBar[],
  options: TrainingBuildOptions = {}
): TrainedModelResult => {
  const examples = buildTrainingExamplesFromOneMinuteBars(bars, options);
  const model = trainRankingModelFromExamples(examples);
  const baselineTopPick = evaluateTopPickWinRate(examples, defaultRankingModel());
  const trainedTopPick = evaluateTopPickWinRate(examples, model);

  return {
    model,
    examples,
    baselineTopPick,
    trainedTopPick
  };
};
