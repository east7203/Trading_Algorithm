import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';
import { RiskConfigStore } from '../../src/stores/riskConfigStore.js';

const contexts: AppContext[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  vi.useRealTimers();
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
  it('keeps Telegram quiet when the IBKR reminder reaches app subscribers', async () => {
    const webPushMessages: Array<Record<string, unknown>> = [];
    const telegramMessages: Array<Record<string, unknown>> = [];

    const ctx = buildApp({
      operationalReminderEnabled: true,
      ibkrLoginTrigger: async () => ({ ok: true }),
      ibkrResendPushTrigger: async () => ({ ok: true }),
      webPushNotificationService: {
        start: async () => {},
        status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          webPushMessages.push(message);
          return { attempted: 1, delivered: 1, removed: 0 };
        }
      } as never,
      telegramAlertService: {
        status: () => ({ enabled: true, ready: true, chatConfigured: true }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          telegramMessages.push(message);
          return { sent: true };
        }
      } as never
    });
    contexts.push(ctx);

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/ibkr-login-reminder'
    });

    expect(response.statusCode).toBe(200);
    expect(webPushMessages).toHaveLength(1);
    expect(webPushMessages[0].title).toBe('IBKR login reminder test');
    expect(telegramMessages).toHaveLength(0);
  });

  it('sends visible progress updates when manual recovery is triggered from the app', async () => {
    const webPushMessages: Array<Record<string, unknown>> = [];
    const telegramMessages: Array<Record<string, unknown>> = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ibkr-manual-recovery-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      operationalReminderEnabled: false,
      ibkrReconnectStateStorePath: path.join(tempDir, 'ibkr-reconnect-state.json'),
      ibkrLoginTrigger: async () => ({ ok: true }),
      ibkrResendPushTrigger: async () => ({ ok: true }),
      webPushNotificationService: {
        start: async () => {},
        status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          webPushMessages.push(message);
          return { attempted: 1, delivered: 1, removed: 0 };
        }
      } as never,
      telegramAlertService: {
        status: () => ({ enabled: true, ready: true, chatConfigured: true }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          telegramMessages.push(message);
          return { sent: true };
        }
      } as never
    });
    contexts.push(ctx);

    await ctx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/login-required',
      payload: {
        symbols: ['NQ', 'ES'],
        source: 'ibkr-bridge',
        reason: 'Manual recovery test',
        fallbackDelaySeconds: 30
      }
    });

    webPushMessages.length = 0;
    telegramMessages.length = 0;

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/ibkr/recovery/retry-login'
    });

    expect(response.statusCode).toBe(200);
    expect(webPushMessages).toHaveLength(2);
    expect(webPushMessages[0].title).toBe('IBKR recovery request received');
    expect(webPushMessages[1].title).toBe('IBKR recovery started');
    expect(telegramMessages).toHaveLength(0);

    const diagnosticsResponse = await ctx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });
    expect(diagnosticsResponse.statusCode).toBe(200);
    expect(diagnosticsResponse.json().diagnostics.ibkrRecovery.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'RECOVERY_REQUESTED', source: 'manual-phone-retry' }),
        expect.objectContaining({ kind: 'RECOVERY_ATTEMPT', source: 'manual-phone-retry' })
      ])
    );
  });

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
    expect(telegramMessages).toHaveLength(0);

    await new Promise((resolve) => {
      setTimeout(resolve, 5_500);
    });

    expect(loginTriggerCalls).toEqual(['manual-phone-retry', 'manual-phone-retry-reminder']);
    expect(resendTriggerCalls).toEqual(['manual-phone-retry-push', 'manual-phone-retry-reminder-push']);
    expect(webPushMessages).toHaveLength(2);
    expect(webPushMessages[1].title).toBe('IBKR still not connected');
    expect(webPushMessages[1].url).toBe('https://167-172-252-171.sslip.io/mobile/?tab=status&focus=ibkr-connection');
    expect(telegramMessages).toHaveLength(0);
  }, 12000);

  it('falls back to Telegram when app notifications do not deliver', async () => {
    const webPushMessages: Array<Record<string, unknown>> = [];
    const telegramMessages: Array<Record<string, unknown>> = [];

    const ctx = buildApp({
      operationalReminderEnabled: false,
      ibkrLoginTrigger: async () => ({ ok: true }),
      ibkrResendPushTrigger: async () => ({ ok: true }),
      webPushNotificationService: {
        start: async () => {},
        status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
        notifyGeneric: async (message: Record<string, unknown>) => {
          webPushMessages.push(message);
          return { attempted: 1, delivered: 0, removed: 0 };
        }
      } as never,
      telegramAlertService: {
        status: () => ({ enabled: true, ready: true, chatConfigured: true }),
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
        symbols: ['NQ'],
        source: 'manual-phone-retry',
        reason: 'Fallback-only test',
        fallbackDelaySeconds: 30
      }
    });

    expect(response.statusCode).toBe(200);
    expect(webPushMessages).toHaveLength(1);
    expect(telegramMessages).toHaveLength(1);
    expect(telegramMessages[0].title).toBe('IBKR login required');
  });

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
    expect(telegramMessages).toHaveLength(0);

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
    expect(telegramMessages).toHaveLength(0);
  });

  it('sends the connected notification after a manual recovery request even when the bridge source completes the reconnect', async () => {
    const webPushMessages: Array<Record<string, unknown>> = [];
    const telegramMessages: Array<Record<string, unknown>> = [];
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ibkr-manual-connect-'));
    tempDirs.push(tempDir);
    const now = new Date();
    const blockedHour = (now.getUTCHours() + 1) % 24;
    const blockedMinute = now.getUTCMinutes();
    const riskConfigStore = new RiskConfigStore();
    riskConfigStore.patch({
      tradingWindow: {
        timezone: 'UTC',
        startHour: blockedHour,
        startMinute: blockedMinute,
        endHour: blockedHour,
        endMinute: blockedMinute
      }
    });

    const ctx = buildApp({
      operationalReminderEnabled: false,
      riskConfigStore,
      ibkrReconnectStateStorePath: path.join(tempDir, 'ibkr-reconnect-state.json'),
      ibkrLoginTrigger: async () => ({ ok: true }),
      ibkrResendPushTrigger: async () => ({ ok: false, reason: 'no prompt' }),
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

    await ctx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/login-required',
      payload: {
        symbols: ['NQ', 'ES'],
        source: 'ibkr-bridge',
        reason: 'Manual reconnect completion test',
        fallbackDelaySeconds: 30
      }
    });

    webPushMessages.length = 0;
    telegramMessages.length = 0;

    await ctx.app.inject({
      method: 'POST',
      path: '/ibkr/recovery/retry-login'
    });

    webPushMessages.length = 0;
    telegramMessages.length = 0;

    const connected = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/connected',
      payload: {
        symbols: ['NQ', 'ES'],
        source: 'ibkr-bridge',
        connectedAt: '2026-03-15T01:02:00.000Z'
      }
    });

    expect(connected.statusCode).toBe(200);
    expect(connected.json().notifiedUsers).toBe(true);
    expect(webPushMessages).toHaveLength(1);
    expect(webPushMessages[0].title).toBe('IBKR connected');
    expect(telegramMessages).toHaveLength(0);
  });
});
