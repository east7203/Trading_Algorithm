import { describe, expect, it } from 'vitest';
import {
  detectDisplacementOrderBlockRetestContinuation,
  generateSetupCandidates,
  detectLiquiditySweepMssFvgContinuation,
  detectLiquiditySweepReversalSessionExtremes,
  detectNyBreakRetestMomentum
} from '../../src/domain/setupDetectors.js';
import type { SignalGenerationInput } from '../../src/domain/types.js';

const baseInput = (): SignalGenerationInput => ({
  symbol: 'NAS100',
  session: 'NY',
  now: '2026-03-07T15:00:00.000Z',
  timeframeData: {
    '15m': [],
    '5m': [],
    '1m': [
      {
        timestamp: '2026-03-07T14:55:00.000Z',
        open: 100,
        high: 101,
        low: 99,
        close: 100.8
      },
      {
        timestamp: '2026-03-07T14:56:00.000Z',
        open: 100.8,
        high: 101.1,
        low: 100.3,
        close: 101
      },
      {
        timestamp: '2026-03-07T14:57:00.000Z',
        open: 101,
        high: 101.4,
        low: 100.7,
        close: 101.2
      }
    ]
  },
  sessionLevels: {
    high: 200,
    low: 180,
    nyRangeHigh: 150,
    nyRangeLow: 140
  }
});

describe('setup detectors', () => {
  it('detects liquidity sweep -> MSS -> FVG continuation (positive)', () => {
    const input = baseInput();
    input.timeframeData['15m'] = [
      { timestamp: '2026-03-07T13:30:00.000Z', open: 100, high: 105, low: 98, close: 104 },
      { timestamp: '2026-03-07T13:45:00.000Z', open: 104, high: 106, low: 100, close: 105 },
      { timestamp: '2026-03-07T14:00:00.000Z', open: 105, high: 107, low: 97, close: 101 },
      { timestamp: '2026-03-07T14:15:00.000Z', open: 101, high: 110, low: 107, close: 109 }
    ];

    const result = detectLiquiditySweepMssFvgContinuation(input);
    expect(result).not.toBeNull();
    expect(result?.setupType).toBe('LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION');
    expect(result?.side).toBe('LONG');
  });

  it('rejects liquidity sweep -> MSS -> FVG continuation when FVG rule fails (negative)', () => {
    const input = baseInput();
    input.timeframeData['15m'] = [
      { timestamp: '2026-03-07T13:30:00.000Z', open: 100, high: 105, low: 98, close: 104 },
      { timestamp: '2026-03-07T13:45:00.000Z', open: 104, high: 106, low: 100, close: 105 },
      { timestamp: '2026-03-07T14:00:00.000Z', open: 105, high: 107, low: 97, close: 101 },
      { timestamp: '2026-03-07T14:15:00.000Z', open: 101, high: 110, low: 105.5, close: 109 }
    ];

    const result = detectLiquiditySweepMssFvgContinuation(input);
    expect(result).toBeNull();
  });

  it('detects liquidity sweep reversal from session extremes (positive)', () => {
    const input = baseInput();
    input.timeframeData['15m'] = [
      { timestamp: '2026-03-07T14:15:00.000Z', open: 197, high: 201.2, low: 195, close: 199.4 }
    ];

    const result = detectLiquiditySweepReversalSessionExtremes(input);
    expect(result).not.toBeNull();
    expect(result?.setupType).toBe('LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES');
    expect(result?.side).toBe('SHORT');
  });

  it('rejects liquidity sweep reversal when no session sweep occurred (negative)', () => {
    const input = baseInput();
    input.timeframeData['15m'] = [
      { timestamp: '2026-03-07T14:15:00.000Z', open: 197, high: 199.5, low: 195, close: 199.4 }
    ];

    const result = detectLiquiditySweepReversalSessionExtremes(input);
    expect(result).toBeNull();
  });

  it('detects displacement + order-block retest continuation (positive)', () => {
    const input = baseInput();
    input.timeframeData['15m'] = [
      { timestamp: '2026-03-07T13:00:00.000Z', open: 98, high: 99, low: 97.5, close: 98.7 },
      { timestamp: '2026-03-07T13:15:00.000Z', open: 98.7, high: 99.3, low: 98.1, close: 99.1 },
      { timestamp: '2026-03-07T13:30:00.000Z', open: 100, high: 107, low: 99.5, close: 106 },
      { timestamp: '2026-03-07T13:45:00.000Z', open: 106, high: 106.5, low: 100, close: 101.5 },
      { timestamp: '2026-03-07T14:00:00.000Z', open: 101.5, high: 108.5, low: 101.2, close: 108.2 }
    ];

    const result = detectDisplacementOrderBlockRetestContinuation(input);
    expect(result).not.toBeNull();
    expect(result?.setupType).toBe('DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION');
    expect(result?.side).toBe('LONG');
  });

  it('rejects displacement continuation when retest rule fails (negative)', () => {
    const input = baseInput();
    input.timeframeData['15m'] = [
      { timestamp: '2026-03-07T13:00:00.000Z', open: 98, high: 99, low: 97.5, close: 98.7 },
      { timestamp: '2026-03-07T13:15:00.000Z', open: 98.7, high: 99.3, low: 98.1, close: 99.1 },
      { timestamp: '2026-03-07T13:30:00.000Z', open: 100, high: 107, low: 99.5, close: 106 },
      { timestamp: '2026-03-07T13:45:00.000Z', open: 106, high: 106.5, low: 101.5, close: 101.6 },
      { timestamp: '2026-03-07T14:00:00.000Z', open: 101.6, high: 108.5, low: 101.2, close: 108.2 }
    ];

    const result = detectDisplacementOrderBlockRetestContinuation(input);
    expect(result).toBeNull();
  });

  it('detects NY break-and-retest momentum (positive)', () => {
    const input = baseInput();
    input.timeframeData['5m'] = [
      { timestamp: '2026-03-07T14:45:00.000Z', open: 149.3, high: 151.2, low: 149, close: 150.8 },
      { timestamp: '2026-03-07T14:50:00.000Z', open: 150.8, high: 151.1, low: 149.8, close: 150.1 },
      { timestamp: '2026-03-07T14:55:00.000Z', open: 150.1, high: 152.1, low: 150, close: 151.6 }
    ];

    const result = detectNyBreakRetestMomentum(input);
    expect(result).not.toBeNull();
    expect(result?.setupType).toBe('NY_BREAK_RETEST_MOMENTUM');
    expect(result?.side).toBe('LONG');
  });

  it('rejects NY break-and-retest momentum when momentum confirmation fails (negative)', () => {
    const input = baseInput();
    input.timeframeData['5m'] = [
      { timestamp: '2026-03-07T14:45:00.000Z', open: 149.3, high: 151.2, low: 149, close: 150.8 },
      { timestamp: '2026-03-07T14:50:00.000Z', open: 150.8, high: 151.1, low: 149.8, close: 150.1 },
      { timestamp: '2026-03-07T14:55:00.000Z', open: 150.1, high: 151.2, low: 149.9, close: 150.7 }
    ];

    const result = detectNyBreakRetestMomentum(input);
    expect(result).toBeNull();
  });

  it('adds higher-timeframe context score metadata to generated candidates', () => {
    const input = baseInput();
    input.timeframeData['5m'] = [
      { timestamp: '2026-03-07T14:45:00.000Z', open: 149.3, high: 151.2, low: 149, close: 150.8 },
      { timestamp: '2026-03-07T14:50:00.000Z', open: 150.8, high: 151.1, low: 149.8, close: 150.1 },
      { timestamp: '2026-03-07T14:55:00.000Z', open: 150.1, high: 152.1, low: 150, close: 151.6 }
    ];
    input.timeframeData['1H'] = [
      { timestamp: '2026-03-07T10:00:00.000Z', open: 148, high: 149, low: 147.8, close: 148.8 },
      { timestamp: '2026-03-07T11:00:00.000Z', open: 148.8, high: 150, low: 148.7, close: 149.9 },
      { timestamp: '2026-03-07T12:00:00.000Z', open: 149.9, high: 151, low: 149.8, close: 150.8 }
    ];
    input.timeframeData['4H'] = [
      { timestamp: '2026-03-06T16:00:00.000Z', open: 145, high: 147, low: 144.5, close: 146.5 },
      { timestamp: '2026-03-06T20:00:00.000Z', open: 146.5, high: 149, low: 146, close: 148.7 },
      { timestamp: '2026-03-07T00:00:00.000Z', open: 148.7, high: 151.2, low: 148.3, close: 150.9 }
    ];
    input.timeframeData.D1 = [
      { timestamp: '2026-03-04T00:00:00.000Z', open: 140, high: 145, low: 139.8, close: 144.1 },
      { timestamp: '2026-03-05T00:00:00.000Z', open: 144.1, high: 148, low: 143.6, close: 147.4 },
      { timestamp: '2026-03-06T00:00:00.000Z', open: 147.4, high: 151.5, low: 147, close: 150.2 }
    ];
    input.timeframeData.W1 = [
      { timestamp: '2026-02-14T00:00:00.000Z', open: 130, high: 139, low: 129.6, close: 137.1 },
      { timestamp: '2026-02-21T00:00:00.000Z', open: 137.1, high: 145, low: 136.7, close: 143.5 },
      { timestamp: '2026-02-28T00:00:00.000Z', open: 143.5, high: 151, low: 143.2, close: 149.8 }
    ];

    const candidates = generateSetupCandidates(input);
    const nyCandidate = candidates.find((candidate) => candidate.setupType === 'NY_BREAK_RETEST_MOMENTUM');

    expect(nyCandidate).toBeDefined();
    expect(typeof nyCandidate?.metadata.aiContextScore).toBe('number');
    expect((nyCandidate?.metadata.aiContextScore as number) > 0).toBe(true);
  });
});
