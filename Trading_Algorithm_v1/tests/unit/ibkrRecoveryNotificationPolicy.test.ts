import { describe, expect, it } from 'vitest';
import { shouldNotifyIbkrRecovery } from '../../src/services/ibkrRecoveryNotificationPolicy.js';

const morningWindow = {
  enabled: true,
  timezone: 'America/New_York',
  startHour: 8,
  startMinute: 30,
  endHour: 11,
  endMinute: 30
};

describe('shouldNotifyIbkrRecovery', () => {
  it('always notifies for manual recovery flows', () => {
    expect(
      shouldNotifyIbkrRecovery('manual-phone-retry', '2026-03-07T18:00:00.000Z', morningWindow)
    ).toBe(true);
  });

  it('always notifies for scheduled reminder flows', () => {
    expect(
      shouldNotifyIbkrRecovery('scheduled-reminder', '2026-03-07T18:00:00.000Z', morningWindow)
    ).toBe(true);
  });

  it('suppresses bridge recovery alerts outside the trading window', () => {
    expect(shouldNotifyIbkrRecovery('ibkr-bridge', '2026-03-07T18:00:00.000Z', morningWindow)).toBe(false);
  });

  it('allows bridge recovery alerts inside the trading window', () => {
    expect(shouldNotifyIbkrRecovery('ibkr-bridge', '2026-03-07T15:00:00.000Z', morningWindow)).toBe(true);
  });
});
