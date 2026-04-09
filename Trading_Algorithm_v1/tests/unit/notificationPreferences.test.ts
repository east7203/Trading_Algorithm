import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_NOTIFICATION_PREFERENCES,
  normalizeAppNotificationPreferences,
  shouldDeliverAppNotification
} from '../../src/services/notificationPreferences.js';

describe('notificationPreferences', () => {
  it('defaults to trade alerts and broker recovery only', () => {
    expect(DEFAULT_APP_NOTIFICATION_PREFERENCES).toEqual({
      enabled: true,
      tradeAlerts: true,
      tradeActivity: false,
      brokerRecovery: true,
      engineUpdates: false
    });
  });

  it('merges partial updates with prior preferences', () => {
    const prefs = normalizeAppNotificationPreferences(
      {
        engineUpdates: true
      },
      {
        enabled: true,
        tradeAlerts: true,
        tradeActivity: true,
        brokerRecovery: false,
        engineUpdates: false
      }
    );

    expect(prefs).toEqual({
      enabled: true,
      tradeAlerts: true,
      tradeActivity: true,
      brokerRecovery: false,
      engineUpdates: true
    });
  });

  it('gates delivery by category and master toggle', () => {
    expect(
      shouldDeliverAppNotification(
        {
          enabled: true,
          tradeAlerts: true,
          tradeActivity: false,
          brokerRecovery: true,
          engineUpdates: false
        },
        'trade-alert'
      )
    ).toBe(true);

    expect(
      shouldDeliverAppNotification(
        {
          enabled: true,
          tradeAlerts: true,
          tradeActivity: false,
          brokerRecovery: true,
          engineUpdates: false
        },
        'trade-activity'
      )
    ).toBe(false);

    expect(
      shouldDeliverAppNotification(
        {
          enabled: false,
          tradeAlerts: true,
          tradeActivity: true,
          brokerRecovery: true,
          engineUpdates: true
        },
        'broker-recovery'
      )
    ).toBe(false);
  });
});
