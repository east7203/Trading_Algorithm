import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
const flushAsyncWork = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  await Promise.resolve();
};
const createManualReconnectClock = (initialIso: string) => {
  let nowMs = Date.parse(initialIso);
  let nextId = 1;
  const timers = new Map<number, { id: number; runAtMs: number; callback: () => void }>();

  return {
    now: () => nowMs,
    setTimeout: (callback: () => void, delayMs: number): NodeJS.Timeout => {
      const timer = { id: nextId, runAtMs: nowMs + Math.max(0, delayMs), callback };
      nextId += 1;
      timers.set(timer.id, timer);
      return timer as unknown as NodeJS.Timeout;
    },
    clearTimeout: (timer: NodeJS.Timeout): void => {
      const id = (timer as unknown as { id?: number }).id;
      if (typeof id === 'number') {
        timers.delete(id);
      }
    },
    advanceBy: async (durationMs: number): Promise<void> => {
      const targetMs = nowMs + durationMs;
      while (true) {
        const nextTimer = [...timers.values()]
          .filter((timer) => timer.runAtMs <= targetMs)
          .sort((left, right) => left.runAtMs - right.runAtMs)[0];
        if (!nextTimer) {
          break;
        }
        timers.delete(nextTimer.id);
        nowMs = nextTimer.runAtMs;
        nextTimer.callback();
        await flushAsyncWork();
      }
      nowMs = targetMs;
      await flushAsyncWork();
    }
  };
};

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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
    const reconnectClock = createManualReconnectClock('2026-03-14T05:59:55.000Z');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ibkr-reconnect-state-'));
    tempDirs.push(tempDir);
    const statePath = path.join(tempDir, 'ibkr-reconnect-state.json');

    const buildContext = () => {
      const ctx = buildApp({
        operationalReminderEnabled: false,
        ibkrReconnectStateStorePath: statePath,
        ibkrReconnectNow: reconnectClock.now,
        ibkrReconnectSetTimeout: reconnectClock.setTimeout,
        ibkrReconnectClearTimeout: reconnectClock.clearTimeout,
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
    const loginRequiredAt = '2026-03-14T05:59:55.000Z';

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
    expect(loginRequiredResponse.json().nextReminderAt).toBe('2026-03-14T06:00:00.000Z');

    await reconnectClock.advanceBy(5_000);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const reminderPoll = await firstCtx.app.inject({
        method: 'GET',
        path: '/diagnostics'
      });
      const recovery = reminderPoll.json().diagnostics.ibkrRecovery;
      if (typeof recovery.lastReminderAt === 'string') {
        break;
      }
      await flushAsyncWork();
    }
    const reminderReady = await firstCtx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });
    expect(typeof reminderReady.json().diagnostics.ibkrRecovery.lastReminderAt).toBe('string');

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

    const connectedAt = '2026-03-14T06:10:00.000Z';
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
