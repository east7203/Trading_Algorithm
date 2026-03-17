import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRankingModelFromPath, normalizeRankingModel } from '../../src/services/rankingModel.js';

const sampleModel = {
  version: 'v1' as const,
  modelId: 'trained-model-1',
  trainedAt: '2026-03-09T00:00:00.000Z',
  sampleCount: 1200,
  globalWinRate: 0.56,
  bias: 1.5,
  confidenceWeight: 13,
  aiContextWeight: 1,
  setupAdjustments: {
    LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION: 3.2,
    LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES: -2.1,
    DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION: 1.1,
    NY_BREAK_RETEST_MOMENTUM: 0.2
  },
  symbolAdjustments: {
    NQ: 2.4
  }
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await fs.rm(dir, { recursive: true, force: true });
    })
  );
});

describe('ranking model loader', () => {
  it('normalizes envelope payloads with model root', () => {
    const normalized = normalizeRankingModel({
      model: sampleModel,
      summary: { sampleCount: 1200 }
    });

    expect(normalized.modelId).toBe('trained-model-1');
    expect(normalized.sampleCount).toBe(1200);
    expect(normalized.setupAdjustments.LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION).toBeCloseTo(3.2);
    expect(normalized.symbolAdjustments.NQ).toBeCloseTo(2.4);
  });

  it('loads model envelope from disk', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ranking-model-'));
    tempDirs.push(tempDir);
    const modelPath = path.join(tempDir, 'model.json');
    await fs.writeFile(
      modelPath,
      JSON.stringify({
        model: sampleModel,
        summary: { inputFileCount: 4 }
      }),
      'utf8'
    );

    const loaded = loadRankingModelFromPath(modelPath);
    expect(loaded).not.toBeNull();
    expect(loaded?.modelId).toBe('trained-model-1');
    expect(loaded?.globalWinRate).toBeCloseTo(0.56);
  });
});
