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
    expect(mobile.body).toContain('Live Engine Health');
    expect(mobile.body).toContain('Live Bias Context');
    expect(mobile.body).toContain('Top 3 Learned Edges');
    expect(mobile.body).toContain('Top 3 Failing Patterns');
    expect(mobile.body).toContain('Recent Autonomy Decisions');
    expect(mobile.body).toContain('Engine Room');
    expect(mobile.body).toContain('Pull to refresh');
    expect(mobile.body).toContain('Continuous Training');
    expect(mobile.body).toContain('Analysis Frames');
    expect(mobile.body).toContain('Market Watchlist');
    expect(mobile.body).toContain('Research Lab');
    expect(mobile.body).toContain('Board Signal');
    expect(mobile.body).toContain('Macro Read');
    expect(mobile.body).toContain('symbolDetailViewer');
    expect(mobile.body).not.toContain('TradingView Checklist');
    expect(mobile.body).not.toContain('TV checklist 0/5');
    expect(mobile.body).toContain('apple-mobile-web-app-capable');
    expect(mobile.body).toContain('Web App');
    expect(mobile.body).toContain('Install App');
    expect(mobile.body).toContain('Allow Push Alerts');
    expect(mobile.body).toContain('Security / System Health');
    expect(mobile.body).toContain('Re-register Push');
    expect(mobile.body).toContain('Run IBKR Recovery Test');
    expect(mobile.body).toContain('Refresh Security Checks');
    expect(mobile.body).toContain('Copy Diagnostics Summary');
    expect(mobile.body).toContain('Share / Export History');
    expect(mobile.body).toContain('Last repair action');
    expect(mobile.body).toContain('Recent Security Events');
    expect(mobile.body).toContain('Manual Trade Alerts');
    expect(mobile.body).toContain('Paper Trade Updates');
    expect(mobile.body).toContain('IBKR Recovery Alerts');
    expect(mobile.body).toContain('Engine Updates');

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

  it('reports notification readiness and the manual signal engine status', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({ method: 'GET', path: '/notifications/status' });
    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.signalAlerts).toBeTruthy();
    expect(payload.signalAlerts.enabled).toBe(true);
    expect(payload.signalAlerts.sourceLabel).toBe('Manual engine');
    expect(payload.webPush).toBeTruthy();
    expect(payload.telegram).toBeTruthy();
  });

  it('sends a manual-engine test alert payload', async () => {
    const ctx = withApp();

    const response = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: { symbol: 'NQ' }
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.alert.source).toBe('MANUAL_TEST');
    expect(payload.alert.title).toContain('manual engine test signal');
    expect(typeof payload.alert.entry).toBe('number');
    expect(typeof payload.alert.stopLoss).toBe('number');
    expect(typeof payload.alert.takeProfit).toBe('number');
  });

  it('serves a live futures confirm chart snapshot for board alerts', async () => {
    const ctx = withApp();

    const testAlertResponse = await ctx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: { symbol: 'NQ' }
    });

    expect(testAlertResponse.statusCode).toBe(200);
    const alert = testAlertResponse.json().alert;

    const response = await ctx.app.inject({
      method: 'GET',
      path:
        `/signals/chart/live?alertId=${encodeURIComponent(alert.alertId)}`
        + `&symbol=${encodeURIComponent(alert.symbol)}`
        + `&side=${encodeURIComponent(alert.side)}`
        + `&setupType=${encodeURIComponent(alert.setupType)}`
        + `&entry=${encodeURIComponent(String(alert.entry))}`
        + `&stopLoss=${encodeURIComponent(String(alert.stopLoss))}`
        + `&takeProfit=${encodeURIComponent(String(alert.takeProfit))}`
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(['live', 'saved', 'unavailable']).toContain(payload.source);
    if (payload.snapshot) {
      expect(payload.snapshot.symbol).toBe('NQ');
      expect(payload.snapshot.timeframe).toBe('5m');
      expect(Array.isArray(payload.snapshot.bars)).toBe(true);
      expect(payload.snapshot.bars.length).toBeGreaterThan(0);
    }
  });

  it('falls back to persisted alert snapshots when the live board queue is empty', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mobile-alert-fallback-'));
    tempDirs.push(tempDir);
    const reviewStorePath = path.join(tempDir, 'signal-reviews.json');
    const settingsStorePath = path.join(tempDir, 'signal-monitor.json');

    const warmCtx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: true,
      signalReviewStorePath: reviewStorePath,
      signalMonitorSettingsStorePath: settingsStorePath
    });
    contexts.push(warmCtx);

    const testAlertResponse = await warmCtx.app.inject({
      method: 'POST',
      path: '/notifications/test/alert',
      payload: { symbol: 'NQ' }
    });

    expect(testAlertResponse.statusCode).toBe(200);
    const createdAlertId = testAlertResponse.json().alert.alertId;
    await warmCtx.app.close();
    contexts.pop();

    const coldCtx = buildApp({
      continuousTrainingEnabled: false,
      signalMonitorEnabled: false,
      signalReviewStorePath: reviewStorePath,
      signalMonitorSettingsStorePath: settingsStorePath
    });
    contexts.push(coldCtx);

    const response = await coldCtx.app.inject({
      method: 'GET',
      path: '/signals/alerts?limit=5'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().alerts).toHaveLength(1);
    expect(response.json().alerts[0].alertId).toBe(createdAlertId);
    expect(response.json().alerts[0].candidate).toBeTruthy();
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
