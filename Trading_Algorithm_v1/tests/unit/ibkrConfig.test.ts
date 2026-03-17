import { describe, expect, it } from 'vitest';
import {
  mapIbkrSymbol,
  parseIbkrContractSpecsEnv,
  parseIbkrSymbolMapEnv,
  resolveIbkrContractSpec
} from '../../src/integrations/ibkr/ibkrConfig.js';

describe('ibkr config helpers', () => {
  it('maps core futures aliases to supported symbols', () => {
    expect(mapIbkrSymbol('NQ')).toBe('NQ');
    expect(mapIbkrSymbol('ES')).toBe('ES');
    expect(mapIbkrSymbol('YM')).toBe('YM');
    expect(mapIbkrSymbol('USTEC')).toBe('NAS100');
    expect(mapIbkrSymbol('DJ30.cash')).toBe('US30');
  });

  it('parses custom symbol map env safely', () => {
    const parsed = parseIbkrSymbolMapEnv('{"NQ_CONT":"NQ","ES_CONT":"ES","BAD":"UNKNOWN"}');
    expect(parsed).toEqual({
      NQ_CONT: 'NQ',
      ES_CONT: 'ES'
    });
  });

  it('parses contract specs from keyed json', () => {
    const parsed = parseIbkrContractSpecsEnv(
      '{"NQ":{"symbol":"NQ","exchange":"CME","currency":"USD","multiplier":"20"}}'
    );
    expect(parsed.NQ).toMatchObject({
      symbol: 'NQ',
      exchange: 'CME',
      currency: 'USD',
      multiplier: '20',
      secType: 'FUT'
    });
  });

  it('parses contract specs from alias array', () => {
    const parsed = parseIbkrContractSpecsEnv(
      '[{"alias":"ES_CONT","symbol":"ES","exchange":"CME","currency":"USD","secType":"CONTFUT"}]'
    );
    expect(parsed.ES_CONT).toMatchObject({
      symbol: 'ES',
      exchange: 'CME',
      currency: 'USD',
      secType: 'CONTFUT'
    });
  });

  it('resolves default IBKR contract specs for supported symbols', () => {
    const resolved = resolveIbkrContractSpec('MNQ');
    expect(resolved).toEqual({
      sourceSymbol: 'MNQ',
      targetSymbol: 'MNQ',
      contract: {
        symbol: 'MNQ',
        exchange: 'CME',
        currency: 'USD',
        multiplier: '2',
        secType: 'FUT'
      }
    });
  });

  it('prefers exact custom contract specs when present', () => {
    const resolved = resolveIbkrContractSpec(
      'NQ1!',
      { 'NQ1!': 'NQ' },
      {
        'NQ1!': {
          symbol: 'NQ',
          exchange: 'CME',
          currency: 'USD',
          multiplier: '20',
          secType: 'CONTFUT'
        }
      }
    );

    expect(resolved).toEqual({
      sourceSymbol: 'NQ1!',
      targetSymbol: 'NQ',
      contract: {
        symbol: 'NQ',
        exchange: 'CME',
        currency: 'USD',
        multiplier: '20',
        secType: 'CONTFUT'
      }
    });
  });
});
