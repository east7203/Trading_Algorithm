import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('native push endpoints', () => {
  it('registers, updates, and unregisters APNs device tokens with notification preferences', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'trading-native-push-'));
    tempDirs.push(tempDir);
    const devicesPath = path.join(tempDir, 'native-devices.json');

    const ctx = buildApp({
      nativePushConfig: {
        enabled: true,
        devicesPath,
        bundleId: 'com.tradingalgo.mobile',
        useSandbox: true
      }
    });
    contexts.push(ctx);

    const initialStatus = await ctx.app.inject({
      method: 'GET',
      path: '/notifications/native/status'
    });

    expect(initialStatus.statusCode).toBe(200);
    expect(initialStatus.json().nativePush.deviceCount).toBe(0);
    expect(initialStatus.json().nativePush.ready).toBe(false);

    const deviceToken = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const register = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/native/register',
      payload: {
        deviceToken,
        platform: 'ios',
        deviceLabel: 'test-iphone',
        notificationPrefs: {
          tradeActivity: true
        }
      }
    });

    expect(register.statusCode).toBe(200);
    expect(register.json().nativePush.deviceCount).toBe(1);

    const update = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/native/register',
      payload: {
        deviceToken,
        platform: 'ios',
        deviceLabel: 'test-iphone',
        notificationPrefs: {
          engineUpdates: true
        }
      }
    });

    expect(update.statusCode).toBe(200);
    expect(update.json().nativePush.deviceCount).toBe(1);

    const storedDevices = JSON.parse(await readFile(devicesPath, 'utf8')) as Array<{
      notificationPrefs: Record<string, boolean>;
    }>;
    expect(storedDevices).toHaveLength(1);
    expect(storedDevices[0].notificationPrefs).toEqual({
      enabled: true,
      tradeAlerts: true,
      tradeActivity: true,
      brokerRecovery: true,
      engineUpdates: true
    });

    const unregister = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/native/unregister',
      payload: {
        deviceToken
      }
    });

    expect(unregister.statusCode).toBe(200);
    expect(unregister.json().nativePush.deviceCount).toBe(0);
  });
});
