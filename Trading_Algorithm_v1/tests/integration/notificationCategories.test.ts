import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';
import type { AppNotificationMessage } from '../../src/services/operationalReminderService.js';
import type { WebPushNotificationService } from '../../src/services/webPushNotificationService.js';

const contexts: AppContext[] = [];

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }
});

const withRecordedNotifications = (): { ctx: AppContext; messages: AppNotificationMessage[] } => {
  const messages: AppNotificationMessage[] = [];
  const webPushNotificationService = {
    start: async () => undefined,
    status: () => ({ enabled: true, ready: true, subscriberCount: 0 }),
    subscribe: async () => undefined,
    unsubscribe: async () => undefined,
    notifySignalAlert: async () => ({ attempted: 0, delivered: 0, removed: 0 }),
    notifyGeneric: async (message: AppNotificationMessage) => {
      messages.push(message);
      return { attempted: 1, delivered: 1, removed: 0 };
    }
  } as unknown as WebPushNotificationService;

  const ctx = buildApp({
    nativePushNotificationService: null,
    webPushNotificationService,
    telegramAlertService: null,
    ibkrLoginTrigger: async () => ({ ok: false, skipped: true, reason: 'test-login' }),
    ibkrResendPushTrigger: async () => ({ ok: false, skipped: true, reason: 'test-resend' })
  });
  contexts.push(ctx);
  return { ctx, messages };
};

describe('notification category routing', () => {
  it('marks research notifications as low-priority engine updates', async () => {
    const { ctx, messages } = withRecordedNotifications();

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/research-experiment',
      payload: {
        symbol: 'NQ',
        direction: 'BULLISH',
        confidence: 0.82
      }
    });

    expect(response.statusCode).toBe(200);
    expect(messages.at(-1)).toMatchObject({
      category: 'engine-update',
      priority: 'low'
    });
  });

  it('marks paper trade notifications as normal-priority trade activity', async () => {
    const { ctx, messages } = withRecordedNotifications();

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/paper-trade',
      payload: {
        symbol: 'ES',
        side: 'BUY',
        stage: 'OPENED'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(messages.at(-1)).toMatchObject({
      category: 'trade-activity',
      priority: 'normal'
    });
  });

  it('does not fall back to Telegram for muted engine updates', async () => {
    const telegramMessages: Array<Record<string, unknown>> = [];
    const webPushNotificationService = {
      start: async () => undefined,
      status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
      subscribe: async () => undefined,
      unsubscribe: async () => undefined,
      notifySignalAlert: async () => ({ attempted: 0, delivered: 0, removed: 0 }),
      notifyGeneric: async () => ({ attempted: 1, delivered: 0, removed: 0 })
    } as unknown as WebPushNotificationService;

    const ctx = buildApp({
      nativePushNotificationService: null,
      webPushNotificationService,
      telegramAlertService: {
        status: () => ({ enabled: true, ready: true, chatConfigured: true }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          telegramMessages.push(message);
          return { sent: true };
        }
      } as never,
      ibkrLoginTrigger: async () => ({ ok: false, skipped: true, reason: 'test-login' }),
      ibkrResendPushTrigger: async () => ({ ok: false, skipped: true, reason: 'test-resend' })
    });
    contexts.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/research-experiment',
      payload: {
        symbol: 'NQ',
        direction: 'BULLISH',
        confidence: 0.82
      }
    });

    expect(response.statusCode).toBe(200);
    expect(telegramMessages).toHaveLength(0);

    const activityResponse = await ctx.app.inject({
      method: 'GET',
      path: '/notifications/activity?limit=5'
    });

    expect(activityResponse.statusCode).toBe(200);
    expect(activityResponse.json().activity[0]).toMatchObject({
      category: 'engine-update',
      title: 'Research experiment opened bullish',
      telegram: {
        fallbackRequested: false,
        triggerReason: 'fallback-disabled',
        attempted: false,
        sent: false
      }
    });
  });

  it('marks IBKR recovery notifications as high-priority broker recovery alerts', async () => {
    const { ctx, messages } = withRecordedNotifications();

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/ibkr/recovery/retry-login'
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(200);
    expect(messages.some((message) => message.category === 'broker-recovery' && message.priority === 'high')).toBe(true);
    expect(messages.at(-1)).toMatchObject({
      category: 'broker-recovery',
      priority: 'high'
    });
  });

  it('records Telegram fallback activity for manual trade alerts when app delivery misses', async () => {
    const telegramAlerts: Array<Record<string, unknown>> = [];
    const ctx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      nativePushNotificationService: null,
      webPushNotificationService: {
        start: async () => undefined,
        status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
        subscribe: async () => undefined,
        unsubscribe: async () => undefined,
        notifySignalAlert: async () => ({ attempted: 1, delivered: 0, removed: 0 }),
        notifyGeneric: async () => ({ attempted: 0, delivered: 0, removed: 0 })
      } as unknown as WebPushNotificationService,
      telegramAlertService: {
        status: () => ({ enabled: true, ready: true, chatConfigured: true }),
        notifySignalAlert: async (message: Record<string, unknown>) => {
          telegramAlerts.push(message);
          return { sent: true };
        },
        notifyGeneric: async () => ({ sent: true })
      } as never
    });
    contexts.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: {
        symbol: 'NQ'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(telegramAlerts).toHaveLength(1);

    const activityResponse = await ctx.app.inject({
      method: 'GET',
      path: '/notifications/activity?limit=5'
    });

    expect(activityResponse.statusCode).toBe(200);
    expect(activityResponse.json().activity[0]).toMatchObject({
      kind: 'signal-alert',
      category: 'trade-alert',
      telegram: {
        fallbackRequested: true,
        triggerReason: 'zero-app-deliveries',
        attempted: true,
        sent: true
      }
    });
  });
});
