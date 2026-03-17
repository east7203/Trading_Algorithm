import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const contexts: AppContext[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
});

describe('IBKR reconnect fallback notifications', () => {
  it('sends an approval follow-up alert if login-required does not recover in time', async () => {
    const webPushMessages: Array<Record<string, unknown>> = [];
    const telegramMessages: Array<Record<string, unknown>> = [];
    const loginTriggerCalls: string[] = [];
    const resendTriggerCalls: string[] = [];

    const ctx = buildApp({
      operationalReminderEnabled: false,
      ibkrLoginTrigger: async (source) => {
        loginTriggerCalls.push(source);
        return { ok: true };
      },
      ibkrResendPushTrigger: async (source) => {
        resendTriggerCalls.push(source);
        return { ok: true };
      },
      webPushNotificationService: {
        start: async () => {},
        status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          webPushMessages.push(message);
          return { attempted: 1, delivered: 1, removed: 0 };
        }
      } as never,
      telegramAlertService: {
        notifyGeneric: async (message: Record<string, unknown>) => {
          telegramMessages.push(message);
          return { sent: true };
        }
      } as never
    });
    contexts.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/login-required',
      payload: {
        symbols: ['NQ', 'YM'],
        source: 'manual-phone-retry',
        reason: 'Fallback test',
        fallbackDelaySeconds: 5
      }
    });

    expect(response.statusCode).toBe(200);
    expect(loginTriggerCalls).toEqual(['manual-phone-retry']);
    expect(resendTriggerCalls).toEqual(['manual-phone-retry-push']);
    expect(webPushMessages).toHaveLength(1);
    expect(webPushMessages[0].url).toBe(
      'https://167-172-252-171.sslip.io/mobile/?tab=status&focus=ibkr-connection'
    );
    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0].buttons).toEqual([
      {
        text: 'Open Status',
        url: 'https://167-172-252-171.sslip.io/mobile/?tab=status&focus=ibkr-connection'
      },
      {
        text: 'Last-Resort Website',
        url: 'https://ndcdyn.interactivebrokers.com/sso/Login'
      }
    ]);

    await new Promise((resolve) => {
      setTimeout(resolve, 5_500);
    });

    expect(loginTriggerCalls).toEqual(['manual-phone-retry', 'manual-phone-retry-reminder']);
    expect(resendTriggerCalls).toEqual(['manual-phone-retry-push', 'manual-phone-retry-reminder-push']);
    expect(webPushMessages).toHaveLength(2);
    expect(webPushMessages[1].title).toBe('IBKR still not connected');
    expect(webPushMessages[1].url).toBe('https://167-172-252-171.sslip.io/mobile/?tab=status&focus=ibkr-connection');

    expect(telegramMessages).toHaveLength(2);
    expect(telegramMessages[1].title).toBe('IBKR still not connected');
    expect(telegramMessages[1].buttons).toEqual([
      {
        text: 'Open Status',
        url: 'https://167-172-252-171.sslip.io/mobile/?tab=status&focus=ibkr-connection'
      },
      {
        text: 'Last-Resort Website',
        url: 'https://ndcdyn.interactivebrokers.com/sso/Login'
      }
    ]);
  }, 12000);

  it('suppresses duplicate connected alerts when no reauthentication was pending', async () => {
    const webPushMessages: Array<Record<string, unknown>> = [];
    const telegramMessages: Array<Record<string, unknown>> = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ibkr-reconnect-dedupe-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      operationalReminderEnabled: false,
      ibkrReconnectStateStorePath: path.join(tempDir, 'ibkr-reconnect-state.json'),
      webPushNotificationService: {
        start: async () => {},
        status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          webPushMessages.push(message);
          return { attempted: 1, delivered: 1, removed: 0 };
        }
      } as never,
      telegramAlertService: {
        notifyGeneric: async (message: Record<string, unknown>) => {
          telegramMessages.push(message);
          return { sent: true };
        }
      } as never
    });
    contexts.push(ctx);

    const first = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/connected',
      payload: {
        symbols: ['NQ', 'YM'],
        source: 'manual-phone-retry',
        connectedAt: '2026-03-15T00:00:00.000Z'
      }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().notifiedUsers).toBe(true);
    expect(webPushMessages).toHaveLength(1);
    expect(telegramMessages).toHaveLength(1);

    const second = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/connected',
      payload: {
        symbols: ['NQ', 'YM'],
        source: 'manual-phone-retry',
        connectedAt: '2026-03-15T00:05:00.000Z'
      }
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().notifiedUsers).toBe(false);
    expect(webPushMessages).toHaveLength(1);
    expect(telegramMessages).toHaveLength(1);
  });
});
