export type AppNotificationCategory =
  | 'trade-alert'
  | 'trade-activity'
  | 'broker-recovery'
  | 'engine-update';

export type AppNotificationPriority = 'high' | 'normal' | 'low';

export interface AppNotificationPreferences {
  enabled: boolean;
  tradeAlerts: boolean;
  tradeActivity: boolean;
  brokerRecovery: boolean;
  engineUpdates: boolean;
}

export const DEFAULT_APP_NOTIFICATION_PREFERENCES: AppNotificationPreferences = {
  enabled: true,
  tradeAlerts: true,
  tradeActivity: false,
  brokerRecovery: true,
  engineUpdates: false
};

export const normalizeAppNotificationPreferences = (
  input: Partial<AppNotificationPreferences> | null | undefined,
  fallback: Partial<AppNotificationPreferences> = {}
): AppNotificationPreferences => ({
  enabled: input?.enabled !== undefined ? input.enabled !== false : fallback.enabled !== false,
  tradeAlerts:
    input?.tradeAlerts !== undefined
      ? input.tradeAlerts !== false
      : fallback.tradeAlerts !== undefined
        ? fallback.tradeAlerts !== false
        : DEFAULT_APP_NOTIFICATION_PREFERENCES.tradeAlerts,
  tradeActivity:
    input?.tradeActivity !== undefined
      ? input.tradeActivity !== false
      : fallback.tradeActivity !== undefined
        ? fallback.tradeActivity !== false
        : DEFAULT_APP_NOTIFICATION_PREFERENCES.tradeActivity,
  brokerRecovery:
    input?.brokerRecovery !== undefined
      ? input.brokerRecovery !== false
      : fallback.brokerRecovery !== undefined
        ? fallback.brokerRecovery !== false
        : DEFAULT_APP_NOTIFICATION_PREFERENCES.brokerRecovery,
  engineUpdates:
    input?.engineUpdates !== undefined
      ? input.engineUpdates !== false
      : fallback.engineUpdates !== undefined
        ? fallback.engineUpdates !== false
        : DEFAULT_APP_NOTIFICATION_PREFERENCES.engineUpdates
});

export const shouldDeliverAppNotification = (
  preferences: Partial<AppNotificationPreferences> | null | undefined,
  category: AppNotificationCategory
): boolean => {
  const resolved = normalizeAppNotificationPreferences(preferences);
  if (!resolved.enabled) {
    return false;
  }

  switch (category) {
    case 'trade-alert':
      return resolved.tradeAlerts;
    case 'trade-activity':
      return resolved.tradeActivity;
    case 'broker-recovery':
      return resolved.brokerRecovery;
    case 'engine-update':
      return resolved.engineUpdates;
    default:
      return false;
  }
};
