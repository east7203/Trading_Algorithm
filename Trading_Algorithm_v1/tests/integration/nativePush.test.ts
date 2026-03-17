import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
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
  it('registers and unregisters APNs device tokens', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'trading-native-push-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      nativePushConfig: {
        enabled: true,
        devicesPath: path.join(tempDir, 'native-devices.json'),
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
        deviceLabel: 'test-iphone'
      }
    });

    expect(register.statusCode).toBe(200);
    expect(register.json().nativePush.deviceCount).toBe(1);

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
