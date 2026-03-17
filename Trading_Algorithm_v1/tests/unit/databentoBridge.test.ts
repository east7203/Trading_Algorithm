import { describe, expect, it } from 'vitest';
import {
  mapDatabentoSymbol,
  parseDatabentoOhlcvCsv
} from '../../src/integrations/databento/databentoLiveBridge.js';

describe('databento live bridge helpers', () => {
  it('maps Databento symbol formats to internal symbols', () => {
    expect(mapDatabentoSymbol('NQ.c.0')).toBe('NQ');
    expect(mapDatabentoSymbol('YM.FUT')).toBe('YM');
    expect(mapDatabentoSymbol('MNQZ6')).toBe('MNQ');
    expect(mapDatabentoSymbol('MYMZ6')).toBe('MYM');
    expect(mapDatabentoSymbol('custom', { CUSTOM: 'NQ' })).toBe('NQ');
  });

  it('parses ohlcv csv and applies fallback symbol when column is missing', () => {
    const csv = [
      'ts_event,open,high,low,close,volume',
      '2026-03-09T13:30:00.000000000Z,18000,18005,17995,18002,12',
      '2026-03-09T13:31:00.000000000Z,18002,18008,18000,18006,9'
    ].join('\n');

    const parsed = parseDatabentoOhlcvCsv(csv, 'NQ.c.0');
    expect(parsed).toHaveLength(2);
    expect(parsed[0].symbol).toBe('NQ');
    expect(parsed[0].timestamp).toBe('2026-03-09T13:30:00.000Z');
    expect(parsed[1].close).toBe(18006);
  });

  it('uses row symbol values when available', () => {
    const csv = [
      'ts_event,open,high,low,close,volume,symbol',
      '2026-03-09T13:30:00.000000000Z,40000,40020,39990,40010,22,YM.c.0'
    ].join('\n');

    const parsed = parseDatabentoOhlcvCsv(csv, 'NQ.c.0');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].symbol).toBe('YM');
  });
});
