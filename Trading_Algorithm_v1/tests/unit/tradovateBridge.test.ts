import { describe, expect, it } from 'vitest';
import {
  extractFinalizedOneMinuteBars,
  mapTradovateSymbol,
  parseSocketPayloads,
  parseSymbolsEnv,
  resolveTradovateContractSymbol
} from '../../src/integrations/tradovate/tradovateBridge.js';

describe('tradovate bridge helpers', () => {
  it('maps Tradovate contract symbols to internal symbols', () => {
    expect(mapTradovateSymbol('NQM6')).toBe('NQ');
    expect(mapTradovateSymbol('ESM6')).toBe('ES');
    expect(mapTradovateSymbol('YMM6')).toBe('YM');
    expect(mapTradovateSymbol('MNQU6')).toBe('MNQ');
    expect(mapTradovateSymbol('MYMU6')).toBe('MYM');
    expect(mapTradovateSymbol('custom-symbol', { 'CUSTOM-SYMBOL': 'NQ' })).toBe('NQ');
  });

  it('resolves root symbols to current quarterly Tradovate contracts', () => {
    expect(resolveTradovateContractSymbol('NQ', new Date('2026-07-01T14:00:00.000Z'))).toBe('NQU6');
    expect(resolveTradovateContractSymbol('ES', new Date('2026-07-01T14:00:00.000Z'))).toBe('ESU6');
    expect(resolveTradovateContractSymbol('NQM6', new Date('2026-07-01T14:00:00.000Z'))).toBe('NQM6');
    expect(parseSymbolsEnv('NQ,ES')).toHaveLength(2);
  });

  it('parses socket payload arrays in object and string forms', () => {
    const objectPayload = parseSocketPayloads('a[{"i":0,"s":200,"d":{"ok":true}}]');
    expect(objectPayload).toHaveLength(1);
    expect(objectPayload[0].i).toBe(0);

    const stringPayload = parseSocketPayloads('a["{\\"i\\":1,\\"e\\":\\"chart\\",\\"d\\":{\\"charts\\":[]}}"]');
    expect(stringPayload).toHaveLength(1);
    expect(stringPayload[0].e).toBe('chart');

    expect(parseSocketPayloads('invalid')).toEqual([]);
  });

  it('emits only finalized bars and carries latest open bar forward', () => {
    const openBars = new Map<string, { timestamp: string; open: number; high: number; low: number; close: number; upVolume?: number; downVolume?: number }>();

    const firstEmission = extractFinalizedOneMinuteBars(
      'NQM6',
      [
        {
          id: 11,
          bars: [
            {
              timestamp: '2026-03-09T13:30:00.000Z',
              open: 18000,
              high: 18005,
              low: 17995,
              close: 18002,
              upVolume: 5,
              downVolume: 3
            },
            {
              timestamp: '2026-03-09T13:31:00.000Z',
              open: 18002,
              high: 18008,
              low: 18000,
              close: 18006,
              upVolume: 7,
              downVolume: 4
            }
          ]
        }
      ],
      openBars
    );

    expect(firstEmission).toHaveLength(1);
    expect(firstEmission[0].timestamp).toBe('2026-03-09T13:30:00.000Z');
    expect(firstEmission[0].symbol).toBe('NQ');
    expect(firstEmission[0].volume).toBe(8);

    const secondEmission = extractFinalizedOneMinuteBars(
      'NQM6',
      [
        {
          id: 12,
          bars: [
            {
              timestamp: '2026-03-09T13:31:00.000Z',
              open: 18002,
              high: 18010,
              low: 18000,
              close: 18009,
              upVolume: 8,
              downVolume: 5
            },
            {
              timestamp: '2026-03-09T13:32:00.000Z',
              open: 18009,
              high: 18012,
              low: 18007,
              close: 18010,
              upVolume: 6,
              downVolume: 2
            }
          ]
        }
      ],
      openBars
    );

    expect(secondEmission).toHaveLength(1);
    expect(secondEmission[0].timestamp).toBe('2026-03-09T13:31:00.000Z');
    expect(secondEmission[0].close).toBe(18009);
    expect(secondEmission[0].volume).toBe(13);
  });
});
