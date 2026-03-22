import fs from 'node:fs';
import type { SetupType, SymbolCode } from '../domain/types.js';

export interface RankingModel {
  version: 'v1';
  modelId: string;
  trainedAt: string;
  sampleCount: number;
  globalWinRate: number;
  bias: number;
  confidenceWeight: number;
  aiContextWeight: number;
  setupAdjustments: Record<SetupType, number>;
  symbolAdjustments: Partial<Record<SymbolCode, number>>;
}

export const emptySetupAdjustments = (): Record<SetupType, number> => ({
  LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION: 0,
  LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES: 0,
  DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION: 0,
  NY_BREAK_RETEST_MOMENTUM: 0,
  WERLEIN_FOREVER_MODEL: 0
});

export const defaultRankingModel = (): RankingModel => ({
  version: 'v1',
  modelId: 'default-rule-model',
  trainedAt: new Date(0).toISOString(),
  sampleCount: 0,
  globalWinRate: 0.5,
  bias: 0,
  confidenceWeight: 10,
  aiContextWeight: 1,
  setupAdjustments: emptySetupAdjustments(),
  symbolAdjustments: {}
});

const toNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const normalizeRankingModel = (raw: unknown): RankingModel => {
  const base = defaultRankingModel();
  if (!raw || typeof raw !== 'object') {
    return base;
  }

  const envelope = raw as Record<string, unknown>;
  const candidate =
    envelope.model && typeof envelope.model === 'object' ? (envelope.model as Record<string, unknown>) : envelope;
  const obj = candidate as Record<string, unknown>;
  const setupAdjustments = emptySetupAdjustments();
  const rawSetup = obj.setupAdjustments as Record<string, unknown> | undefined;
  if (rawSetup && typeof rawSetup === 'object') {
    for (const key of Object.keys(setupAdjustments) as SetupType[]) {
      setupAdjustments[key] = clamp(toNumber(rawSetup[key], 0), -20, 20);
    }
  }

  const symbolAdjustments: Partial<Record<SymbolCode, number>> = {};
  const rawSymbols = obj.symbolAdjustments as Record<string, unknown> | undefined;
  if (rawSymbols && typeof rawSymbols === 'object') {
    const symbols: SymbolCode[] = ['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM'];
    for (const symbol of symbols) {
      if (symbol in rawSymbols) {
        symbolAdjustments[symbol] = clamp(toNumber(rawSymbols[symbol], 0), -10, 10);
      }
    }
  }

  return {
    version: 'v1',
    modelId: typeof obj.modelId === 'string' && obj.modelId.length > 0 ? obj.modelId : base.modelId,
    trainedAt:
      typeof obj.trainedAt === 'string' && obj.trainedAt.length > 0 ? obj.trainedAt : base.trainedAt,
    sampleCount: Math.max(0, Math.round(toNumber(obj.sampleCount, base.sampleCount))),
    globalWinRate: clamp(toNumber(obj.globalWinRate, base.globalWinRate), 0, 1),
    bias: clamp(toNumber(obj.bias, base.bias), -20, 20),
    confidenceWeight: clamp(toNumber(obj.confidenceWeight, base.confidenceWeight), 0, 30),
    aiContextWeight: clamp(toNumber(obj.aiContextWeight, base.aiContextWeight), 0, 10),
    setupAdjustments,
    symbolAdjustments
  };
};

export const loadRankingModelFromPath = (modelPath: string): RankingModel | null => {
  try {
    if (!fs.existsSync(modelPath)) {
      return null;
    }
    const raw = fs.readFileSync(modelPath, 'utf8');
    return normalizeRankingModel(JSON.parse(raw));
  } catch {
    return null;
  }
};
