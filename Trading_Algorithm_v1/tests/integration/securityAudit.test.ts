import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const contexts: AppContext[] = [];
const originalTrainingApiKey = process.env.TRAINING_API_KEY;
const originalTrainingApiKeyHeader = process.env.TRAINING_API_KEY_HEADER;

afterEach(async () => {
  process.env.TRAINING_API_KEY = originalTrainingApiKey;
  process.env.TRAINING_API_KEY_HEADER = originalTrainingApiKeyHeader;
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }
});

const withApp = (ctx: AppContext): AppContext => {
  contexts.push(ctx);
  return ctx;
};

describe('security hardening', () => {
  it('blocks unauthenticated remote api reads', async () => {
    const ctx = withApp(buildApp());

    const response = await ctx.app.inject({
      method: 'GET',
      path: '/diagnostics',
      remoteAddress: '203.0.113.10'
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Forbidden');
  });

  it('allows same-origin app requests with the trusted client header', async () => {
    const ctx = withApp(buildApp({ paperTradingEnabled: true }));

    const response = await ctx.app.inject({
      method: 'PATCH',
      path: '/paper-account/config',
      remoteAddress: '203.0.113.10',
      headers: {
        host: '167-172-252-171.sslip.io',
        origin: 'https://167-172-252-171.sslip.io',
        'x-tradeassist-client': 'mobile-web'
      },
      payload: {
        maxConcurrentTrades: 0,
        autonomyMode: 'UNRESTRICTED',
        autonomyRiskPct: 0.5
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().paperAccount.autonomyMode).toBe('UNRESTRICTED');
  });

  it('blocks cross-site forged browser writes even with the app header', async () => {
    const ctx = withApp(buildApp());

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/paper-trade',
      remoteAddress: '203.0.113.10',
      headers: {
        host: '167-172-252-171.sslip.io',
        origin: 'https://evil.example',
        'x-tradeassist-client': 'mobile-web'
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().message).toBe('Forbidden');
  });

  it('allows authenticated internal bridge traffic via API key', async () => {
    process.env.TRAINING_API_KEY = 'security-test-key';
    process.env.TRAINING_API_KEY_HEADER = 'x-api-key';
    const ctx = withApp(buildApp({ paperTradingEnabled: true }));

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/training/ingest-bars',
      remoteAddress: '203.0.113.10',
      headers: {
        'x-api-key': 'security-test-key'
      },
      payload: {
        bars: [
          {
            symbol: 'NQ',
            timestamp: '2026-04-01T14:30:00.000Z',
            open: 1,
            high: 2,
            low: 0.5,
            close: 1.5,
            volume: 10
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().paperIngest.accepted).toBeGreaterThanOrEqual(0);
  });

  it('sets defensive response headers on the mobile shell', async () => {
    const ctx = withApp(buildApp());

    const response = await ctx.app.inject({
      method: 'GET',
      path: '/mobile/'
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('reports security posture in diagnostics', async () => {
    process.env.TRAINING_API_KEY = 'security-test-key';
    process.env.TRAINING_API_KEY_HEADER = 'x-api-key';
    const ctx = withApp(buildApp());

    const response = await ctx.app.inject({
      method: 'GET',
      path: '/diagnostics'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().diagnostics.notifications.telegramFallbackMode).toBe('broker-recovery-only');
    expect(response.json().diagnostics.security.remoteGuardEnabled).toBe(true);
    expect(response.json().diagnostics.security.internalApiAuth.enabled).toBe(true);
    expect(response.json().diagnostics.security.internalApiAuth.headers).toContain('x-api-key');
    expect(response.json().diagnostics.security.trustedClient.header).toBe('x-tradeassist-client');
  });

  it('does not leak raw error objects in invalid request responses', async () => {
    const ctx = withApp(buildApp());

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/signals/generate',
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().message).toBeTruthy();
    expect(response.json().error).toBeUndefined();
  });
});
