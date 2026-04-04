import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppContext } from '../../src/app.js';

const contexts: AppContext[] = [];

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx) {
      await ctx.app.close();
    }
  }
});

const withApp = (): AppContext => {
  const ctx = buildApp();
  contexts.push(ctx);
  return ctx;
};

describe('mobile app endpoints', () => {
  it('serves health and mobile app shell', async () => {
    const ctx = withApp();

    const health = await ctx.app.inject({ method: 'GET', path: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);

    const mobile = await ctx.app.inject({ method: 'GET', path: '/mobile/' });
    expect(mobile.statusCode).toBe(200);
    expect(mobile.headers['content-type']).toContain('text/html');
    expect(mobile.body).toContain('Evan TradeAssist');
    expect(mobile.body).toContain('Learning Lab');
    expect(mobile.body).toContain('Engine Room');
    expect(mobile.body).toContain('Pull to refresh');
    expect(mobile.body).toContain('Continuous Training');
    expect(mobile.body).toContain('Analysis Frames');
    expect(mobile.body).toContain('Market Watchlist');
    expect(mobile.body).toContain('Research Lab');
    expect(mobile.body).toContain('Board Signal');
    expect(mobile.body).toContain('Macro Read');
    expect(mobile.body).toContain('symbolDetailViewer');
    expect(mobile.body).toContain('apple-mobile-web-app-capable');
    expect(mobile.body).toContain('Web App');
    expect(mobile.body).toContain('Install App');

    const opener = await ctx.app.inject({ method: 'GET', path: '/mobile/open-app.html' });
    expect(opener.statusCode).toBe(200);
    expect(opener.body).toContain('Opening App');
  });

  it('serves a standalone manifest with install shortcuts', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({ method: 'GET', path: '/mobile/manifest.webmanifest' });
    expect(response.statusCode).toBe(200);

    const manifest = response.json();
    expect(manifest.name).toBe('Evan TradeAssist');
    expect(manifest.display).toBe('standalone');
    expect(manifest.id).toBe('/mobile/');
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(5);
  });

  it('redirects malformed mobile restore links back to the mobile shell', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({
      method: 'GET',
      path: '/mobile/2restore=f3ec911&refresh=v30'
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/mobile/?restore=f3ec911&refresh=v30');
  });

  it('serves compact ai context with bounded arrays', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({ method: 'GET', path: '/ai/context/compact' });
    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.context).toBeTruthy();
    expect(payload.context.desk).toBeTruthy();
    expect(payload.context.learning).toBeTruthy();
    expect(payload.context.macro).toBeTruthy();
    expect(payload.context.macro.nextEvents.length).toBeLessThanOrEqual(3);
    expect(payload.context.learning.preferredSetups.length).toBeLessThanOrEqual(3);
    expect(payload.context.learning.preferredSymbols.length).toBeLessThanOrEqual(3);
  });

  it('serves a desk brief built from compact context', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({ method: 'GET', path: '/ai/desk-brief' });
    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.brief).toBeTruthy();
    expect(payload.brief.headline).toBeTruthy();
    expect(payload.brief.summary).toBeTruthy();
    expect(payload.brief.actions.length).toBeLessThanOrEqual(3);
    expect(payload.brief.reasons.length).toBeLessThanOrEqual(3);
    expect(payload.brief.watch.length).toBeLessThanOrEqual(3);
    expect(payload.brief.context).toBeTruthy();
    expect(payload.brief.context.macro.nextEvents.length).toBeLessThanOrEqual(3);
  });

  it('serves a home deck payload for the home watchlist shell', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({ method: 'GET', path: '/home/deck' });
    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.deck).toBeTruthy();
    expect(payload.deck.watchlist).toBeTruthy();
    expect(Array.isArray(payload.deck.watchlist)).toBe(true);
    expect(payload.deck.watchlist.length).toBeLessThanOrEqual(2);
    expect(typeof payload.deck.headline).toBe('string');
    expect(payload.deck.watchlist.every((item: { symbol: string }) => typeof item.symbol === 'string')).toBe(true);
    expect(payload.deck.researchLab).toBeTruthy();
  });

  it('sends a controlled paper-trade notification test payload', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/paper-trade',
      payload: {
        symbol: 'ES',
        side: 'BUY',
        stage: 'CLOSED',
        delayMinutes: 12,
        pnl: 250,
        equity: 100250
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.test.symbol).toBe('ES');
    expect(payload.test.stage).toBe('CLOSED');
    expect(payload.test.deliveryStatus).toBe('DELAYED');
    expect(payload.deliveries).toBeTruthy();
  });

  it('sends a controlled research experiment notification with a short summary', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/research-experiment',
      payload: {
        symbol: 'NQ',
        direction: 'BEARISH',
        confidence: 0.81,
        thesis: 'momentum is failing under the prior high',
        delayMinutes: 9
      }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.test.symbol).toBe('NQ');
    expect(payload.test.deliveryStatus).toBe('DELAYED');
    expect(payload.deliveries).toBeTruthy();
  });
});
