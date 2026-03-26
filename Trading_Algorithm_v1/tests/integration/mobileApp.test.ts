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
    expect(mobile.body).toContain('Trading Assist');
    expect(mobile.body).toContain('Review Loop');
    expect(mobile.body).toContain('Diagnostics');
    expect(mobile.body).toContain('Pull to refresh');
    expect(mobile.body).toContain('Continuous Training');
    expect(mobile.body).toContain('Analysis Frames');

    const opener = await ctx.app.inject({ method: 'GET', path: '/mobile/open-app.html' });
    expect(opener.statusCode).toBe(200);
    expect(opener.body).toContain('Opening App');
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
});
