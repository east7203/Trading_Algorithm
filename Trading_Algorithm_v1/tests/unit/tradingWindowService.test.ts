import { describe, expect, it } from 'vitest';
import { isWithinTradingWindow } from '../../src/services/tradingWindowService.js';

const morningWindow = {
  enabled: true,
  timezone: 'America/New_York',
  startHour: 8,
  startMinute: 30,
  endHour: 11,
  endMinute: 30
};

describe('isWithinTradingWindow', () => {
  it('returns true during NY morning window', () => {
    const result = isWithinTradingWindow('2026-03-07T15:00:00.000Z', morningWindow);
    expect(result).toBe(true);
  });

  it('returns false outside NY morning window', () => {
    const result = isWithinTradingWindow('2026-03-07T18:00:00.000Z', morningWindow);
    expect(result).toBe(false);
  });

  it('returns true when window guard is disabled', () => {
    const result = isWithinTradingWindow('2026-03-07T18:00:00.000Z', {
      ...morningWindow,
      enabled: false
    });
    expect(result).toBe(true);
  });
});
