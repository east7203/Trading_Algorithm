import { v4 as uuidv4 } from 'uuid';
import type { Candle, SetupCandidate, Side, SignalGenerationInput } from './types.js';

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const averageBody = (candles: Candle[]): number => {
  if (candles.length === 0) {
    return 0;
  }
  const total = candles.reduce((sum, candle) => sum + Math.abs(candle.close - candle.open), 0);
  return total / candles.length;
};

const oneMinuteConfidenceForSide = (candles: Candle[], side: Side): number => {
  const sample = candles.slice(-5);
  if (sample.length === 0) {
    return 0.5;
  }

  const directionalCloses = sample.filter((candle) =>
    side === 'LONG' ? candle.close > candle.open : candle.close < candle.open
  ).length;

  const ratio = directionalCloses / sample.length;
  return clamp(ratio, 0.1, 1);
};

const averageClose = (candles: Candle[]): number => {
  if (candles.length === 0) {
    return 0;
  }
  return candles.reduce((sum, candle) => sum + candle.close, 0) / candles.length;
};

const averageRange = (candles: Candle[]): number => {
  if (candles.length === 0) {
    return 0;
  }
  return candles.reduce((sum, candle) => sum + Math.abs(candle.high - candle.low), 0) / candles.length;
};

const timeframeTrendScore = (candles: Candle[]): number => {
  if (candles.length < 3) {
    return 0;
  }

  const sample = candles.slice(-20);
  const first = sample[0];
  const last = sample[sample.length - 1];
  if (!first || !last) {
    return 0;
  }

  const mean = averageClose(sample);
  if (mean === 0) {
    return 0;
  }

  const slope = (last.close - first.close) / mean;
  const displacement = (last.close - mean) / mean;
  const volatility = averageRange(sample) / mean;
  const raw = (slope * 10 + displacement * 5) / (1 + volatility * 20);
  return clamp(raw, -1, 1);
};

const regimeScore = (input: SignalGenerationInput): number => {
  const frames: Array<{ candles: Candle[] | undefined; weight: number }> = [
    { candles: input.timeframeData['1H'], weight: 1.2 },
    { candles: input.timeframeData['4H'], weight: 1.6 },
    { candles: input.timeframeData.D1, weight: 1.3 },
    { candles: input.timeframeData.W1, weight: 0.9 }
  ];

  let weighted = 0;
  let totalWeight = 0;
  for (const frame of frames) {
    if (!frame.candles || frame.candles.length < 3) {
      continue;
    }
    weighted += timeframeTrendScore(frame.candles) * frame.weight;
    totalWeight += frame.weight;
  }

  if (totalWeight === 0) {
    return 0;
  }
  return clamp(weighted / totalWeight, -1, 1);
};

const addAiContext = (candidate: SetupCandidate, input: SignalGenerationInput): SetupCandidate => {
  const context = regimeScore(input);
  const directional = candidate.side === 'LONG' ? context : -context;
  const aiContextScore = clamp(directional * 4, -4, 4);

  return {
    ...candidate,
    metadata: {
      ...candidate.metadata,
      regimeScore: context,
      aiContextScore
    }
  };
};

const createCandidate = (
  input: SignalGenerationInput,
  setupType: SetupCandidate['setupType'],
  side: Side,
  entry: number,
  stopLoss: number,
  baseScore: number,
  passReasons: string[],
  metadata: Record<string, unknown>
): SetupCandidate => {
  const riskDistance = Math.abs(entry - stopLoss);
  const tp1 = side === 'LONG' ? entry + riskDistance * 1.5 : entry - riskDistance * 1.5;
  const tp2 = side === 'LONG' ? entry + riskDistance * 2.5 : entry - riskDistance * 2.5;

  return {
    id: uuidv4(),
    setupType,
    symbol: input.symbol,
    session: input.session,
    detectionTimeframe: '15m',
    executionTimeframe: '5m',
    side,
    entry,
    stopLoss,
    takeProfit: [tp1, tp2],
    baseScore,
    oneMinuteConfidence: oneMinuteConfidenceForSide(input.timeframeData['1m'], side),
    eligibility: {
      passed: true,
      passReasons,
      failReasons: []
    },
    metadata,
    generatedAt: input.now
  };
};

export const detectLiquiditySweepMssFvgContinuation = (
  input: SignalGenerationInput
): SetupCandidate | null => {
  const candles = input.timeframeData['15m'];
  if (candles.length < 4) {
    return null;
  }

  const a = candles[candles.length - 4];
  const b = candles[candles.length - 3];
  const c = candles[candles.length - 2];
  const d = candles[candles.length - 1];

  const bullishSweep = c.low < Math.min(a.low, b.low);
  const bullishMss = d.close > b.high;
  const bullishFvg = d.low > b.high;

  if (bullishSweep && bullishMss && bullishFvg) {
    return createCandidate(
      input,
      'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION',
      'LONG',
      d.close,
      c.low,
      74,
      ['Liquidity sweep confirmed', 'MSS bullish break confirmed', 'FVG continuation confirmed'],
      {
        sweepCandleTimestamp: c.timestamp,
        mssBreakReference: b.high,
        fvgGapLow: b.high,
        fvgGapHigh: d.low
      }
    );
  }

  const bearishSweep = c.high > Math.max(a.high, b.high);
  const bearishMss = d.close < b.low;
  const bearishFvg = d.high < b.low;

  if (bearishSweep && bearishMss && bearishFvg) {
    return createCandidate(
      input,
      'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION',
      'SHORT',
      d.close,
      c.high,
      74,
      ['Liquidity sweep confirmed', 'MSS bearish break confirmed', 'FVG continuation confirmed'],
      {
        sweepCandleTimestamp: c.timestamp,
        mssBreakReference: b.low,
        fvgGapLow: d.high,
        fvgGapHigh: b.low
      }
    );
  }

  return null;
};

export const detectLiquiditySweepReversalSessionExtremes = (
  input: SignalGenerationInput
): SetupCandidate | null => {
  const candles = input.timeframeData['15m'];
  if (candles.length === 0) {
    return null;
  }

  const latest = candles[candles.length - 1];

  if (latest.high > input.sessionLevels.high && latest.close < input.sessionLevels.high) {
    return createCandidate(
      input,
      'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
      'SHORT',
      latest.close,
      latest.high,
      70,
      ['Session high sweep detected', 'Close back inside session range'],
      {
        sweptLevel: input.sessionLevels.high,
        sweepDirection: 'up'
      }
    );
  }

  if (latest.low < input.sessionLevels.low && latest.close > input.sessionLevels.low) {
    return createCandidate(
      input,
      'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
      'LONG',
      latest.close,
      latest.low,
      70,
      ['Session low sweep detected', 'Close back inside session range'],
      {
        sweptLevel: input.sessionLevels.low,
        sweepDirection: 'down'
      }
    );
  }

  return null;
};

export const detectDisplacementOrderBlockRetestContinuation = (
  input: SignalGenerationInput
): SetupCandidate | null => {
  const candles = input.timeframeData['15m'];
  if (candles.length < 5) {
    return null;
  }

  const displacement = candles[candles.length - 3];
  const retest = candles[candles.length - 2];
  const confirmation = candles[candles.length - 1];
  const lookback = candles.slice(Math.max(0, candles.length - 8), candles.length - 3);
  const avg = averageBody(lookback);
  const body = Math.abs(displacement.close - displacement.open);
  const displacementStrong = avg > 0 ? body >= avg * 1.8 : body > 0;

  if (!displacementStrong) {
    return null;
  }

  const bullishDisplacement = displacement.close > displacement.open;
  const bearishDisplacement = displacement.close < displacement.open;

  if (
    bullishDisplacement &&
    retest.low <= displacement.open &&
    retest.close > displacement.open &&
    confirmation.close > displacement.high
  ) {
    return createCandidate(
      input,
      'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
      'LONG',
      confirmation.close,
      retest.low,
      76,
      ['Strong bullish displacement', 'Order block retest held', 'Continuation close confirmed'],
      {
        displacementTimestamp: displacement.timestamp,
        orderBlockLevel: displacement.open
      }
    );
  }

  if (
    bearishDisplacement &&
    retest.high >= displacement.open &&
    retest.close < displacement.open &&
    confirmation.close < displacement.low
  ) {
    return createCandidate(
      input,
      'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
      'SHORT',
      confirmation.close,
      retest.high,
      76,
      ['Strong bearish displacement', 'Order block retest held', 'Continuation close confirmed'],
      {
        displacementTimestamp: displacement.timestamp,
        orderBlockLevel: displacement.open
      }
    );
  }

  return null;
};

export const detectNyBreakRetestMomentum = (input: SignalGenerationInput): SetupCandidate | null => {
  const candles = input.timeframeData['5m'];
  if (candles.length < 3) {
    return null;
  }

  const breakCandle = candles[candles.length - 3];
  const retestCandle = candles[candles.length - 2];
  const momentumCandle = candles[candles.length - 1];

  if (
    breakCandle.close > input.sessionLevels.nyRangeHigh &&
    retestCandle.low <= input.sessionLevels.nyRangeHigh &&
    retestCandle.close >= input.sessionLevels.nyRangeHigh &&
    momentumCandle.close > breakCandle.close
  ) {
    return createCandidate(
      input,
      'NY_BREAK_RETEST_MOMENTUM',
      'LONG',
      momentumCandle.close,
      retestCandle.low,
      72,
      ['NY range break upward', 'Retest held at break level', 'Momentum continuation close'],
      {
        brokenRangeLevel: input.sessionLevels.nyRangeHigh,
        breakTimestamp: breakCandle.timestamp
      }
    );
  }

  if (
    breakCandle.close < input.sessionLevels.nyRangeLow &&
    retestCandle.high >= input.sessionLevels.nyRangeLow &&
    retestCandle.close <= input.sessionLevels.nyRangeLow &&
    momentumCandle.close < breakCandle.close
  ) {
    return createCandidate(
      input,
      'NY_BREAK_RETEST_MOMENTUM',
      'SHORT',
      momentumCandle.close,
      retestCandle.high,
      72,
      ['NY range break downward', 'Retest held at break level', 'Momentum continuation close'],
      {
        brokenRangeLevel: input.sessionLevels.nyRangeLow,
        breakTimestamp: breakCandle.timestamp
      }
    );
  }

  return null;
};

export const generateSetupCandidates = (input: SignalGenerationInput): SetupCandidate[] => {
  const detectors = [
    detectLiquiditySweepMssFvgContinuation,
    detectLiquiditySweepReversalSessionExtremes,
    detectDisplacementOrderBlockRetestContinuation,
    detectNyBreakRetestMomentum
  ];

  return detectors
    .map((detector) => detector(input))
    .filter((candidate): candidate is SetupCandidate => candidate !== null)
    .map((candidate) => addAiContext(candidate, input));
};
