import { describe, expect, it } from 'vitest';
import { evaluateFallbackWatchdog } from '../../src/tools/runIbkrFallbackWatchdog.js';

describe('evaluateFallbackWatchdog', () => {
  it('stays idle while feed is live', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'LIVE',
        nowMs: 1_000,
        staleSinceMs: 500,
        thresholdMs: 60_000,
        yahooOnline: false,
        primaryReady: false
      })
    ).toEqual({
      nextStaleSinceMs: undefined,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      shouldNotifyNotLive: false,
      primaryReady: false
    });
  });

  it('does not treat a reachable IBKR API session as healthy while bars are stale', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'STALE',
        nowMs: 90_000,
        staleSinceMs: 500,
        thresholdMs: 60_000,
        yahooOnline: true,
        primaryReady: true
      })
    ).toEqual({
      nextStaleSinceMs: 500,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      shouldNotifyNotLive: true,
      primaryReady: false
    });
  });

  it('treats a reachable IBKR API session as recovered only when the feed is live', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'LIVE',
        nowMs: 90_000,
        staleSinceMs: 500,
        thresholdMs: 60_000,
        yahooOnline: true,
        primaryReady: true
      })
    ).toEqual({
      nextStaleSinceMs: undefined,
      shouldActivateFallback: false,
      shouldDeactivateFallback: true,
      shouldNotifyNotLive: false,
      primaryReady: true
    });
  });

  it('starts stale tracking before threshold is reached', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'STALE',
        nowMs: 10_000,
        staleSinceMs: undefined,
        thresholdMs: 60_000,
        yahooOnline: false,
        primaryReady: false
      })
    ).toEqual({
      nextStaleSinceMs: 10_000,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      shouldNotifyNotLive: false,
      primaryReady: false
    });
  });

  it('activates fallback once stale threshold is exceeded and yahoo is still down', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'STALE',
        nowMs: 90_000,
        staleSinceMs: 10_000,
        thresholdMs: 60_000,
        yahooOnline: false,
        primaryReady: false
      })
    ).toEqual({
      nextStaleSinceMs: 10_000,
      shouldActivateFallback: true,
      shouldDeactivateFallback: false,
      shouldNotifyNotLive: true,
      primaryReady: false
    });
  });

  it('does not reactivate fallback while yahoo is already online', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'WAITING',
        nowMs: 90_000,
        staleSinceMs: 10_000,
        thresholdMs: 60_000,
        yahooOnline: true,
        primaryReady: false
      })
    ).toEqual({
      nextStaleSinceMs: 10_000,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      shouldNotifyNotLive: true,
      primaryReady: false
    });
  });

  it('honors the not-live notification cooldown', () => {
    expect(
      evaluateFallbackWatchdog({
        liveFeedStatus: 'DELAYED',
        nowMs: 90_000,
        staleSinceMs: 10_000,
        thresholdMs: 60_000,
        alertCooldownMs: 60_000,
        lastNotLiveAlertAtMs: 50_000,
        yahooOnline: true,
        primaryReady: false
      })
    ).toEqual({
      nextStaleSinceMs: 10_000,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      shouldNotifyNotLive: false,
      primaryReady: false
    });
  });
});
