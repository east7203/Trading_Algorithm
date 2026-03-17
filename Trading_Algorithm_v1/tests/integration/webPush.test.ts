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

describe('web push endpoints', () => {
  it('issues a public key and tracks subscriptions', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'trading-webpush-'));
    tempDirs.push(tempDir);

    const ctx = buildApp({
      webPushConfig: {
        enabled: true,
        subscriptionsPath: path.join(tempDir, 'subscriptions.json'),
        vapidKeysPath: path.join(tempDir, 'vapid-keys.json'),
        vapidSubject: 'mailto:test@example.com'
      }
    });
    contexts.push(ctx);

    const keyResponse = await ctx.app.inject({
      method: 'GET',
      path: '/notifications/webpush/public-key'
    });

    expect(keyResponse.statusCode).toBe(200);
    const { publicKey } = keyResponse.json();
    expect(typeof publicKey).toBe('string');
    expect(publicKey.length).toBeGreaterThan(20);

    const subscription = {
      endpoint: 'https://example.com/push/abc',
      expirationTime: null,
      keys: {
        p256dh: 'test-p256dh',
        auth: 'test-auth'
      }
    };

    const subscribeResponse = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/webpush/subscribe',
      payload: {
        subscription,
        deviceLabel: 'test-device',
        platform: 'macos'
      }
    });

    expect(subscribeResponse.statusCode).toBe(200);
    expect(subscribeResponse.json().webPush.subscriberCount).toBe(1);

    const statusResponse = await ctx.app.inject({
      method: 'GET',
      path: '/notifications/webpush/status'
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().webPush.subscriberCount).toBe(1);

    const unsubscribeResponse = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/webpush/unsubscribe',
      payload: {
        endpoint: subscription.endpoint
      }
    });

    expect(unsubscribeResponse.statusCode).toBe(200);
    expect(unsubscribeResponse.json().webPush.subscriberCount).toBe(0);
  });
});
