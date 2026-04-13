import { describe, expect, it } from 'vitest';
import type { SignalAlert } from '../../src/domain/types.js';
import {
  buildReminderStatusText,
  buildTradeLevelLines,
  buildTradeLevelSummary,
  signalAlertSourceLabel
} from '../../src/services/signalAlertNotificationFormatter.js';

const buildAlert = (): SignalAlert => ({
  alertId: 'alert-1',
  symbol: 'NQ',
  setupType: 'NY_BREAK_RETEST_MOMENTUM',
  side: 'LONG',
  detectedAt: '2026-04-13T14:30:00.000Z',
  rankingModelId: 'model-1',
  source: 'MANUAL_ENGINE',
  title: 'NQ LONG alert',
  summary: 'summary',
  candidate: {
    id: 'candidate-1',
    setupType: 'NY_BREAK_RETEST_MOMENTUM',
    symbol: 'NQ',
    session: 'NY',
    detectionTimeframe: '5m',
    executionTimeframe: '5m',
    side: 'LONG',
    entry: 20100,
    stopLoss: 20080,
    takeProfit: [20136],
    baseScore: 80,
    oneMinuteConfidence: 0.7,
    finalScore: 86,
    eligibility: {
      passed: true,
      passReasons: [],
      failReasons: []
    },
    metadata: {},
    generatedAt: '2026-04-13T14:30:00.000Z'
  },
  riskDecision: {
    allowed: true,
    finalRiskPct: 0.35,
    positionSize: 1,
    reasonCodes: [],
    blockedByNewsWindow: false,
    blockedByTradingWindow: false,
    blockedByPolicy: false,
    checkedAt: '2026-04-13T14:30:00.000Z'
  }
});

describe('signal alert notification formatter', () => {
  it('builds compact trade-level summary text for push alerts', () => {
    expect(buildTradeLevelSummary(buildAlert())).toEqual([
      'Entry 20100.00',
      'Stop 20080.00',
      'TP 20136.00',
      'RR 1.80'
    ]);
  });

  it('builds line-by-line trade levels for Telegram alerts', () => {
    expect(buildTradeLevelLines(buildAlert())).toEqual([
      'Entry: 20100.00',
      'Stop: 20080.00',
      'Take Profit: 20136.00',
      'Risk / Reward: 1.80R'
    ]);
  });

  it('labels the source and reminder state clearly', () => {
    expect(signalAlertSourceLabel(buildAlert())).toBe('Manual engine');
    expect(buildReminderStatusText({ reason: 'initial', reminderCount: 0 })).toBeNull();
    expect(buildReminderStatusText({ reason: 'reminder', reminderCount: 1 })).toBe('Still unacknowledged');
  });
});
