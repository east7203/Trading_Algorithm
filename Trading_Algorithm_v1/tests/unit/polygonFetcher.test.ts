import { describe, expect, it } from 'vitest';
import { mapPolygonTicker } from '../../src/tools/fetchPolygonHistorical.js';

describe('polygon fetcher symbol mapping', () => {
  it('maps common index and ETF proxies to futures symbols', () => {
    expect(mapPolygonTicker('QQQ')).toBe('NQ');
    expect(mapPolygonTicker('SPY')).toBe('ES');
    expect(mapPolygonTicker('DIA')).toBe('YM');
    expect(mapPolygonTicker('I:NDX')).toBe('NQ');
    expect(mapPolygonTicker('I:SPX')).toBe('ES');
    expect(mapPolygonTicker('I:DJI')).toBe('YM');
  });

  it('respects custom mapping overrides', () => {
    expect(mapPolygonTicker('QQQ', { QQQ: 'NAS100' })).toBe('NAS100');
    expect(mapPolygonTicker('DIA', { DIA: 'US30' })).toBe('US30');
  });

  it('returns null for unknown ticker when unmapped', () => {
    expect(mapPolygonTicker('TLT')).toBeNull();
  });
});
