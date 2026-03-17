import { describe, expect, it } from 'vitest';
import {
  mapYahooSymbol,
  parseYahooChartResponse
} from '../../src/integrations/yahoo/yahooLiveBridge.js';

describe('yahoo live bridge helpers', () => {
  it('maps Yahoo symbols to internal symbols', () => {
    expect(mapYahooSymbol('^NDX')).toBe('NAS100');
    expect(mapYahooSymbol('^DJI')).toBe('US30');
    expect(mapYahooSymbol('NQ=F')).toBe('NQ');
    expect(mapYahooSymbol('YM=F')).toBe('YM');
    expect(mapYahooSymbol('custom', { CUSTOM: 'MNQ' })).toBe('MNQ');
  });

  it('parses chart response and skips rows with missing ohlc fields', () => {
    const payload = {
      chart: {
        result: [
          {
            meta: { symbol: '^NDX' },
            timestamp: [1_700_000_000, 1_700_000_060],
            indicators: {
              quote: [
                {
                  open: [18000, null],
                  high: [18010, 18011],
                  low: [17990, 17995],
                  close: [18005, 18007],
                  volume: [25, 30]
                }
              ]
            }
          }
        ],
        error: null
      }
    };

    const parsed = parseYahooChartResponse(payload, '^NDX');
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      symbol: 'NAS100',
      timestamp: '2023-11-14T22:13:20.000Z',
      open: 18000,
      high: 18010,
      low: 17990,
      close: 18005,
      volume: 25
    });
  });

  it('uses requested symbol when metadata symbol is missing', () => {
    const payload = {
      chart: {
        result: [
          {
            timestamp: [1_700_000_000],
            indicators: {
              quote: [
                {
                  open: [40000],
                  high: [40010],
                  low: [39990],
                  close: [40005],
                  volume: [12]
                }
              ]
            }
          }
        ],
        error: null
      }
    };

    const parsed = parseYahooChartResponse(payload, '^DJI');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].symbol).toBe('US30');
  });
});
