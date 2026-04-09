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
});
