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

const nearestLiquidityTargets = (
  side: Side,
  entry: number,
  stopLoss: number,
  sessionLevels: SignalGenerationInput['sessionLevels']
): number[] => {
  const riskDistance = Math.abs(entry - stopLoss);
  const fallbackInternal = side === 'LONG' ? entry + riskDistance * 2 : entry - riskDistance * 2;
  const fallbackExternal = side === 'LONG' ? entry + riskDistance * 2.5 : entry - riskDistance * 2.5;
  const pools =
    side === 'LONG'
      ? [sessionLevels.nyRangeHigh, sessionLevels.high].filter((level) => level > entry).sort((a, b) => a - b)
      : [sessionLevels.nyRangeLow, sessionLevels.low].filter((level) => level < entry).sort((a, b) => b - a);

  const internal = pools[0] ?? fallbackInternal;
  const external = pools[1] ?? (side === 'LONG' ? Math.max(fallbackExternal, internal) : Math.min(fallbackExternal, internal));

  return [internal, external];
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

const createDerivedCandidate = (
  input: SignalGenerationInput,
  trigger: SetupCandidate,
  setupType: SetupCandidate['setupType'],
  baseScore: number,
  passReasons: string[],
  metadata: Record<string, unknown>
): SetupCandidate => ({
  id: uuidv4(),
  setupType,
  symbol: input.symbol,
  session: input.session,
  detectionTimeframe: '15m',
  executionTimeframe: '5m',
  side: trigger.side,
  entry: trigger.entry,
  stopLoss: trigger.stopLoss,
  takeProfit: nearestLiquidityTargets(trigger.side, trigger.entry, trigger.stopLoss, input.sessionLevels),
  baseScore,
  oneMinuteConfidence: trigger.oneMinuteConfidence,
  eligibility: {
    passed: true,
    passReasons,
    failReasons: []
  },
  metadata,
  generatedAt: input.now
});

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

const recentFvgZone = (
  candles: Candle[],
  side: Side
): { low: number; high: number; midpoint: number; createdAt: string } | null => {
  for (let index = candles.length - 3; index >= Math.max(0, candles.length - 8); index -= 1) {
    const first = candles[index];
    const third = candles[index + 2];
    if (!first || !third) {
      continue;
    }

    if (side === 'LONG' && first.high < third.low) {
      const low = first.high;
      const high = third.low;
      return {
        low,
        high,
        midpoint: (low + high) / 2,
        createdAt: third.timestamp
      };
    }

    if (side === 'SHORT' && first.low > third.high) {
      const low = third.high;
      const high = first.low;
      return {
        low,
        high,
        midpoint: (low + high) / 2,
        createdAt: third.timestamp
      };
    }
  }

  return null;
};

const inferWerleinDrawSide = (
  candles: Candle[]
): { side: Side; rangeHigh: number; rangeLow: number; midpoint: number; trendScore: number } | null => {
  if (candles.length < 4) {
    return null;
  }

  const sample = candles.slice(-8);
  const rangeHigh = Math.max(...sample.map((candle) => candle.high));
  const rangeLow = Math.min(...sample.map((candle) => candle.low));
  const midpoint = (rangeHigh + rangeLow) / 2;
  const latest = sample[sample.length - 1];
  const trendScore = timeframeTrendScore(sample);

  if (!latest) {
    return null;
  }

  if (latest.close <= midpoint && trendScore >= -0.2) {
    return {
      side: 'LONG',
      rangeHigh,
      rangeLow,
      midpoint,
      trendScore
    };
  }

  if (latest.close >= midpoint && trendScore <= 0.2) {
    return {
      side: 'SHORT',
      rangeHigh,
      rangeLow,
      midpoint,
      trendScore
    };
  }

  if (trendScore > 0.3) {
    return {
      side: 'LONG',
      rangeHigh,
      rangeLow,
      midpoint,
      trendScore
    };
  }

  if (trendScore < -0.3) {
    return {
      side: 'SHORT',
      rangeHigh,
      rangeLow,
      midpoint,
      trendScore
    };
  }

  return null;
};

const hasHigherTimeframeFvgRejection = (
  candles1H: Candle[],
  candles15m: Candle[],
  side: Side
): { zone: { low: number; high: number; midpoint: number; createdAt: string } } | null => {
  const zone = recentFvgZone(candles1H, side);
  if (!zone || candles15m.length < 2) {
    return null;
  }

  const probe = candles15m.slice(-2);
  const latest = probe[probe.length - 1];
  if (!latest) {
    return null;
  }

  const tagged = probe.some((candle) => candle.high >= zone.low && candle.low <= zone.high);
  if (!tagged) {
    return null;
  }

  const reclaimed = side === 'LONG' ? latest.close >= zone.midpoint : latest.close <= zone.midpoint;
  if (!reclaimed) {
    return null;
  }

  return { zone };
};

const detectSmtDivergence = (
  currentCandles: Candle[],
  relatedCandles: Candle[] | undefined,
  side: Side
): { confirmed: boolean; mode: string } => {
  if (!relatedCandles || currentCandles.length < 5 || relatedCandles.length < 5) {
    return {
      confirmed: false,
      mode: 'unavailable'
    };
  }

  const currentSweep = currentCandles[currentCandles.length - 2];
  const relatedSweep = relatedCandles[relatedCandles.length - 2];
  const currentPrior = currentCandles.slice(-5, -2);
  const relatedPrior = relatedCandles.slice(-5, -2);
  if (!currentSweep || !relatedSweep || currentPrior.length === 0 || relatedPrior.length === 0) {
    return {
      confirmed: false,
      mode: 'unavailable'
    };
  }

  const currentLowSweep = currentSweep.low < Math.min(...currentPrior.map((candle) => candle.low));
  const relatedLowSweep = relatedSweep.low < Math.min(...relatedPrior.map((candle) => candle.low));
  const currentHighSweep = currentSweep.high > Math.max(...currentPrior.map((candle) => candle.high));
  const relatedHighSweep = relatedSweep.high > Math.max(...relatedPrior.map((candle) => candle.high));

  if (side === 'LONG' && currentLowSweep !== relatedLowSweep) {
    return {
      confirmed: true,
      mode: currentLowSweep ? 'current-swept-peer-held' : 'peer-swept-current-held'
    };
  }

  if (side === 'SHORT' && currentHighSweep !== relatedHighSweep) {
    return {
      confirmed: true,
      mode: currentHighSweep ? 'current-swept-peer-held' : 'peer-swept-current-held'
    };
  }

  return {
    confirmed: false,
    mode: 'none'
  };
};

export const detectWerleinForeverModel = (input: SignalGenerationInput): SetupCandidate | null => {
  const candles15m = input.timeframeData['15m'];
  const candles1H = input.timeframeData['1H'] ?? [];
  if (candles15m.length < 5 || candles1H.length < 4) {
    return null;
  }

  const draw = inferWerleinDrawSide(candles1H);
  if (!draw) {
    return null;
  }

  const htfRejection = hasHigherTimeframeFvgRejection(candles1H, candles15m, draw.side);
  if (!htfRejection) {
    return null;
  }

  const lowerTimeframeTriggers = [
    detectLiquiditySweepMssFvgContinuation(input),
    detectDisplacementOrderBlockRetestContinuation(input)
  ].filter((candidate): candidate is SetupCandidate => candidate !== null && candidate.side === draw.side);
  const trigger = lowerTimeframeTriggers.sort((a, b) => b.baseScore - a.baseScore)[0];
  if (!trigger) {
    return null;
  }

  const smt = detectSmtDivergence(
    candles15m,
    input.relatedMarket?.timeframeData['15m'],
    draw.side
  );
  const passReasons = [
    `Higher-timeframe draw on liquidity points ${draw.side === 'LONG' ? 'higher' : 'lower'}`,
    '1H fair value gap rejection aligned with premium/discount',
    `Lower-timeframe ${trigger.setupType} trigger confirmed`
  ];

  if (smt.confirmed) {
    passReasons.push(`NQ/ES SMT divergence confirmed (${smt.mode})`);
  }

  const baseScore = clamp(trigger.baseScore + 8 + (smt.confirmed ? 4 : 0), 78, 92);
  return createDerivedCandidate(input, trigger, 'WERLEIN_FOREVER_MODEL', baseScore, passReasons, {
    ...trigger.metadata,
    werleinProxyVersion: 'public-v1',
    higherTimeframeDol: draw.side === 'LONG' ? 'higher' : 'lower',
    higherTimeframeRangeHigh: draw.rangeHigh,
    higherTimeframeRangeLow: draw.rangeLow,
    higherTimeframeRangeMidpoint: draw.midpoint,
    higherTimeframeTrendScore: draw.trendScore,
    higherTimeframeFvgLow: htfRejection.zone.low,
    higherTimeframeFvgHigh: htfRejection.zone.high,
    higherTimeframeFvgMidpoint: htfRejection.zone.midpoint,
    higherTimeframeFvgCreatedAt: htfRejection.zone.createdAt,
    lowerTimeframeTriggerSetup: trigger.setupType,
    relatedSymbol: input.relatedMarket?.symbol,
    smtConfirmed: smt.confirmed,
    smtMode: smt.mode
  });
};

export const generateSetupCandidates = (input: SignalGenerationInput): SetupCandidate[] => {
  const detectors = [
    detectLiquiditySweepMssFvgContinuation,
    detectLiquiditySweepReversalSessionExtremes,
    detectDisplacementOrderBlockRetestContinuation,
    detectNyBreakRetestMomentum,
    detectWerleinForeverModel
  ];

  return detectors
    .map((detector) => detector(input))
    .filter((candidate): candidate is SetupCandidate => candidate !== null)
    .map((candidate) => addAiContext(candidate, input));
};
