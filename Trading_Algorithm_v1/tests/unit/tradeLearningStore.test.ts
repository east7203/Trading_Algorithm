import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TradeLearningStore } from '../../src/stores/tradeLearningStore.js';
import type { SignalAlert } from '../../src/domain/types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

const buildAlert = (alertId: string, detectedAt: string, price = 100): SignalAlert => ({
  alertId,
  symbol: 'NQ',
  setupType: 'NY_BREAK_RETEST_MOMENTUM',
  side: 'LONG',
  detectedAt,
  rankingModelId: 'ranking-model-test',
  title: 'NQ LONG setup',
  summary: 'Trade-learning recovery test alert',
  candidate: {
    id: `${alertId}-candidate`,
    setupType: 'NY_BREAK_RETEST_MOMENTUM',
    symbol: 'NQ',
    session: 'NY',
    detectionTimeframe: '5m',
    executionTimeframe: '5m',
    side: 'LONG',
    entry: price,
    stopLoss: price - 5,
    takeProfit: [price + 8],
    baseScore: 80,
    oneMinuteConfidence: 0.7,
    finalScore: 82,
    eligibility: {
      passed: true,
      passReasons: ['pass'],
      failReasons: []
    },
    metadata: {},
    generatedAt: detectedAt
  },
  riskDecision: {
    allowed: true,
    finalRiskPct: 0.5,
    positionSize: 1,
    reasonCodes: [],
    blockedByNewsWindow: false,
    blockedByTradingWindow: false,
    blockedByPolicy: false,
    checkedAt: detectedAt
  }
});

describe('trade learning store', () => {
  it('recovers complete records from a truncated persisted file', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'trade-learning-store-'));
    tempDirs.push(tempDir);

    const filePath = path.join(tempDir, 'trade-learning.json');
    const seedStore = new TradeLearningStore(filePath);
    await seedStore.recordAlert(buildAlert('alert-1', '2026-04-08T13:30:00.000Z', 100), 'signal-monitor');
    await seedStore.recordAlert(buildAlert('alert-2', '2026-04-08T13:35:00.000Z', 110), 'signal-monitor');

    const validRaw = await fs.readFile(filePath, 'utf8');
    const secondRecordIndex = validRaw.indexOf('"alertId": "alert-1"');
    expect(secondRecordIndex).toBeGreaterThan(0);
    const truncatedRaw = validRaw.slice(0, secondRecordIndex + 40);
    await fs.writeFile(filePath, truncatedRaw, 'utf8');

    const recoveredStore = new TradeLearningStore(filePath);
    const records = await recoveredStore.listAllRecords();
    expect(records).toHaveLength(1);
    expect(records[0].alertId).toBe('alert-2');

    const summary = await recoveredStore.summary();
    expect(summary.totalRecords).toBe(1);

    const repairedRaw = await fs.readFile(filePath, 'utf8');
    expect(() => JSON.parse(repairedRaw)).not.toThrow();

    const dirEntries = await fs.readdir(tempDir);
    expect(dirEntries.some((entry) => entry.startsWith('trade-learning.json.corrupt-'))).toBe(true);
  });
});
