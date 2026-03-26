import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const contexts: AppContext[] = [];
const tempDirs: string[] = [];

const waitFor = async (fn: () => Promise<boolean>, timeoutMs = 3_000, intervalMs = 50): Promise<void> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await fn()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
};

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

describe('IBKR reconnect state persistence', () => {
  it('persists reconnect history across app restarts', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ibkr-reconnect-state-'));
    tempDirs.push(tempDir);
    const statePath = path.join(tempDir, 'ibkr-reconnect-state.json');

    const buildContext = () => {
      const ctx = buildApp({
        operationalReminderEnabled: false,
        ibkrReconnectStateStorePath: statePath,
        ibkrLoginTrigger: async () => ({ ok: true }),
        ibkrResendPushTrigger: async () => ({ ok: true }),
        webPushNotificationService: {
          start: async () => {},
          status: () => ({ enabled: true, ready: true, subscriberCount: 1 }),
          notifyGeneric: async () => ({ attempted: 1, delivered: 1, removed: 0 })
        } as never,
        telegramAlertService: {
          status: () => ({ enabled: true, ready: true, chatConfigured: true }),
          notifyGeneric: async () => ({ sent: true })
        } as never
      });
      contexts.push(ctx);
      return ctx;
    };

    const firstCtx = buildContext();
    const loginRequiredAt = '2026-03-14T05:00:00.000Z';

    const loginRequiredResponse = await firstCtx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/login-required',
      payload: {
        symbols: ['NQ', 'YM'],
        source: 'manual-phone-retry',
        detectedAt: loginRequiredAt,
        fallbackDelaySeconds: 5
      }
    });

    expect(loginRequiredResponse.statusCode).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 5_500));

    await firstCtx.app.close();
    contexts.pop();

    const secondCtx = buildContext();
    await waitFor(async () => {
      const poll = await secondCtx.app.inject({
        method: 'GET',
        path: '/diagnostics'
      });
      return poll.json().diagnostics.ibkrRecovery.pendingReconnect === true;
    });
    const persistedPending = await secondCtx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });
    expect(persistedPending.statusCode).toBe(200);
    const pendingPayload = persistedPending.json();
    expect(pendingPayload.diagnostics.ibkrRecovery.pendingReconnect).toBe(true);
    expect(pendingPayload.diagnostics.ibkrRecovery.lastLoginRequiredAt).toBe(loginRequiredAt);
    expect(typeof pendingPayload.diagnostics.ibkrRecovery.lastReminderAt).toBe('string');
    expect(pendingPayload.diagnostics.ibkrRecovery.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'LOGIN_REQUIRED', at: loginRequiredAt, source: 'manual-phone-retry' }),
        expect.objectContaining({ kind: 'REMINDER', source: 'manual-phone-retry' })
      ])
    );

    const connectedAt = '2026-03-14T05:10:00.000Z';
    const connectedResponse = await secondCtx.app.inject({
      method: 'POST',
      path: '/notifications/ibkr/connected',
      payload: {
        symbols: ['NQ', 'YM'],
        source: 'persist-test',
        connectedAt
      }
    });
    expect(connectedResponse.statusCode).toBe(200);

    await secondCtx.app.close();
    contexts.pop();

    const thirdCtx = buildContext();
    await waitFor(async () => {
      const poll = await thirdCtx.app.inject({
        method: 'GET',
        path: '/diagnostics'
      });
      return poll.json().diagnostics.ibkrRecovery.pendingReconnect === false;
    });
    const persistedConnected = await thirdCtx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });
    expect(persistedConnected.statusCode).toBe(200);
    const connectedPayload = persistedConnected.json();
    expect(connectedPayload.diagnostics.ibkrRecovery.pendingReconnect).toBe(false);
    expect(connectedPayload.diagnostics.ibkrRecovery.lastConnectedAt).toBe(connectedAt);
    expect(connectedPayload.diagnostics.ibkrRecovery.lastLoginRequiredAt).toBe(loginRequiredAt);
    expect(connectedPayload.diagnostics.ibkrRecovery.history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'CONNECTED', at: connectedAt, source: 'persist-test' })
      ])
    );
  }, 20000);
});
