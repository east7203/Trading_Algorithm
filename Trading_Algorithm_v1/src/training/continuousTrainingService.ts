import fs from 'node:fs/promises';
import path from 'node:path';
import type { SymbolCode } from '../domain/types.js';
import { defaultRankingModel, type RankingModel } from '../services/rankingModel.js';
import type { RankingModelStore } from '../services/rankingModelStore.js';
import {
  buildTrainingExamplesFromOneMinuteBars,
  evaluateTopPickWinRate,
  parseOneMinuteCsv,
  trainRankingModelFromExamples,
  type OneMinuteBar,
  type TopPickWinRate,
  type TrainingBuildOptions,
  type TrainingExample
} from './historicalTrainer.js';
import { type LearningFeedbackCounts, type LearningFeedbackDataset } from './liveLearning.js';

interface EvaluationSummary {
  baselineTopPick: TopPickWinRate;
  trainedTopPick: TopPickWinRate;
  delta: number;
}

export interface TrainingRunResult {
  trigger: string;
  executed: boolean;
  reason?: string;
  barCount: number;
  sampleCount: number;
  historicalExampleCount?: number;
  feedbackExampleCount?: number;
  manualFeedbackExamples?: number;
  autoFeedbackExamples?: number;
  preferenceFeedbackExamples?: number;
  trainExampleCount: number;
  validationExampleCount: number;
  modelId?: string;
  fullHistoryDelta?: number;
  validationDelta?: number;
  championWinRate?: number;
  challengerWinRate?: number;
  promotionDelta?: number;
  promoted?: boolean;
  promotionReason?: string;
  evaluationSet?: 'validation' | 'train-fallback';
  activeModelId?: string;
  activeFullHistoryDelta?: number;
  activeEvaluationDelta?: number;
  trainedAt?: string;
}

export interface TrainingRunHistoryEntry extends TrainingRunResult {
  recordedAt: string;
}

export interface PromotionDecision {
  promoted: boolean;
  reason: string;
  evaluationSet: 'validation' | 'train-fallback';
  championModelId: string;
  challengerModelId: string;
  championWinRate: number;
  challengerWinRate: number;
  delta: number;
  decidedAt: string;
}

export interface ContinuousTrainingStatus {
  enabled: boolean;
  started: boolean;
  ingestCount: number;
  dedupeCount: number;
  barCount: number;
  latestBarTimestamp?: string;
  trainRuns: number;
  lastTrainedAt?: string;
  lastError?: string;
  trainingInProgress: boolean;
  newBarsSinceTrain: number;
  model: {
    modelId: string;
    sampleCount: number;
    trainedAt: string;
  };
  feedback: LearningFeedbackCounts;
  promotion: {
    activeModelId: string;
    promotionMinDelta: number;
    minEvaluationTopPicks: number;
    alwaysPromoteLatestModel: boolean;
    promotions: number;
    blockedPromotions: number;
    lastDecision?: PromotionDecision;
  };
  cadence: {
    retrainIntervalMinutes: number;
    minNewBarsForRetrain: number;
    barsNeededForNextRetrain: number;
    nextWindowAt?: string;
  };
  data: {
    bootstrapCsvFiles: number;
    pollIngestCount: number;
    archivePath?: string;
    modelOutputPath?: string;
    challengerOutputPath?: string;
    historyOutputPath?: string;
    bootstrapTimeframe: '1m';
    analysisTimeframes: string[];
  };
  progress: {
    historyCount: number;
    lastPromotedAt?: string;
    bestFullHistoryDelta?: number;
    bestValidationDelta?: number;
    averageValidationDeltaLast5?: number;
    activeFullHistoryDelta?: number;
    activeEvaluationDelta?: number;
  };
  lastRun?: TrainingRunResult;
  history: TrainingRunHistoryEntry[];
}

export interface ContinuousTrainingConfig {
  enabled: boolean;
  retrainIntervalMs: number;
  minBarsToTrain: number;
  minExamplesToTrain: number;
  minNewBarsForRetrain: number;
  maxBarsRetained: number;
  validationPct: number;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  liveArchivePath?: string;
  modelOutputPath?: string;
  challengerOutputPath?: string;
  historyOutputPath?: string;
  historyLimit: number;
  trainingOptions?: TrainingBuildOptions;
  feedbackDatasetProvider?: () => Promise<LearningFeedbackDataset> | LearningFeedbackDataset;
  promotionMinDelta: number;
  minEvaluationTopPicks: number;
  alwaysPromoteLatestModel?: boolean;
  pollUrl?: string;
  pollIntervalMs: number;
  pollApiKey?: string;
  pollApiKeyHeader?: string;
  onRunRecorded?: (run: TrainingRunHistoryEntry) => Promise<void> | void;
}

const knownSymbols = new Set<SymbolCode>(['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM']);

const normalizeSymbol = (raw: unknown): SymbolCode => {
  if (typeof raw !== 'string') {
    throw new Error('Bar symbol is required');
  }
  const value = raw.trim().toUpperCase() as SymbolCode;
  if (!knownSymbols.has(value)) {
    throw new Error(`Unsupported symbol "${raw}"`);
  }
  return value;
};

const toNumber = (raw: unknown, field: string): number => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error(`Bar ${field} must be a finite number`);
  }
  return raw;
};

const normalizeBar = (raw: unknown): OneMinuteBar => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Bar must be an object');
  }
  const obj = raw as Record<string, unknown>;
  const timestampRaw = obj.timestamp;
  if (typeof timestampRaw !== 'string') {
    throw new Error('Bar timestamp is required');
  }
  const parsed = Date.parse(timestampRaw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid bar timestamp "${timestampRaw}"`);
  }

  const volumeRaw = obj.volume;
  const volume =
    typeof volumeRaw === 'number'
      ? toNumber(volumeRaw, 'volume')
      : volumeRaw === undefined || volumeRaw === null
        ? undefined
        : Number(volumeRaw);

  if (volume !== undefined && !Number.isFinite(volume)) {
    throw new Error('Bar volume must be numeric when provided');
  }

  return {
    timestamp: new Date(parsed).toISOString(),
    open: toNumber(obj.open, 'open'),
    high: toNumber(obj.high, 'high'),
    low: toNumber(obj.low, 'low'),
    close: toNumber(obj.close, 'close'),
    volume,
    symbol: normalizeSymbol(obj.symbol)
  };
};

const inferSymbolFromFileName = (filePath: string): SymbolCode | undefined => {
  const aliasToSymbol: Record<string, SymbolCode> = {
    MNQ: 'MNQ',
    MYM: 'MYM',
    NAS100: 'NAS100',
    US30: 'US30',
    ES: 'ES',
    SPY: 'ES',
    SPX: 'ES',
    GSPC: 'ES',
    US500: 'ES',
    USTEC: 'NAS100',
    US100: 'NAS100',
    DJ30: 'US30',
    DJI: 'US30',
    NQ: 'NQ',
    YM: 'YM'
  };

  const tokens = path
    .basename(filePath)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0);
  const priority = ['MNQ', 'MYM', 'NAS100', 'US30', 'USTEC', 'US100', 'ES', 'SPY', 'SPX', 'GSPC', 'US500', 'DJ30', 'DJI', 'NQ', 'YM'];
  for (const key of priority) {
    if (tokens.includes(key)) {
      return aliasToSymbol[key];
    }
  }
  return undefined;
};

const dedupeBars = (bars: OneMinuteBar[]): OneMinuteBar[] => {
  const byKey = new Map<string, OneMinuteBar>();
  for (const bar of bars) {
    byKey.set(`${bar.symbol}|${bar.timestamp}`, bar);
  }
  return [...byKey.values()].sort((a, b) => {
    const byTs = a.timestamp.localeCompare(b.timestamp);
    if (byTs !== 0) {
      return byTs;
    }
    return a.symbol.localeCompare(b.symbol);
  });
};

const splitExamples = (
  examples: TrainingExample[],
  validationPct: number
): { trainExamples: TrainingExample[]; validationExamples: TrainingExample[] } => {
  if (validationPct <= 0 || examples.length < 10) {
    return { trainExamples: examples, validationExamples: [] };
  }

  const sorted = examples
    .slice()
    .sort((a, b) => a.candidate.generatedAt.localeCompare(b.candidate.generatedAt));
  const holdout = Math.floor(sorted.length * (validationPct / 100));
  if (holdout <= 0 || holdout >= sorted.length) {
    return { trainExamples: sorted, validationExamples: [] };
  }

  const splitAt = sorted.length - holdout;
  return {
    trainExamples: sorted.slice(0, splitAt),
    validationExamples: sorted.slice(splitAt)
  };
};

const evaluateExamples = (examples: TrainingExample[], model: ReturnType<typeof trainRankingModelFromExamples>): EvaluationSummary => {
  const baselineTopPick = evaluateTopPickWinRate(examples, defaultRankingModel());
  const trainedTopPick = evaluateTopPickWinRate(examples, model);
  return {
    baselineTopPick,
    trainedTopPick,
    delta: trainedTopPick.winRate - baselineTopPick.winRate
  };
};

const compareModels = (
  examples: TrainingExample[],
  champion: RankingModel,
  challenger: RankingModel
): {
  championTopPick: TopPickWinRate;
  challengerTopPick: TopPickWinRate;
  delta: number;
} => {
  const championTopPick = evaluateTopPickWinRate(examples, champion);
  const challengerTopPick = evaluateTopPickWinRate(examples, challenger);
  return {
    championTopPick,
    challengerTopPick,
    delta: challengerTopPick.winRate - championTopPick.winRate
  };
};

const listCsvFiles = async (dirPath: string, recursive: boolean): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        const nested = await listCsvFiles(fullPath, recursive);
        for (const file of nested) {
          files.push(file);
        }
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      files.push(fullPath);
    }
  }
  return files;
};

const isLikelyOneMinuteCsv = (filePath: string): boolean => {
  const name = path.basename(filePath).toLowerCase();
  return (
    name.includes('1minute') ||
    name.includes('one-minute') ||
    name.includes('one_minute') ||
    /(^|[^a-z0-9])1m([^a-z0-9]|$)/.test(name)
  );
};

const ANALYSIS_TIMEFRAMES = ['1m', '5m', '15m', '1H', '4H', 'D1', 'W1'] as const;

interface TrainingHistoryStore {
  history: TrainingRunHistoryEntry[];
  promotions: number;
  blockedPromotions: number;
  lastPromotionDecision?: PromotionDecision;
}

const toOptionalNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeTrainingRunHistoryEntry = (raw: unknown): TrainingRunHistoryEntry | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.trigger !== 'string' || typeof obj.executed !== 'boolean') {
    return null;
  }
  const recordedAt =
    typeof obj.recordedAt === 'string' && obj.recordedAt.length > 0
      ? obj.recordedAt
      : new Date(0).toISOString();

  return {
    trigger: obj.trigger,
    executed: obj.executed,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined,
    barCount: typeof obj.barCount === 'number' && Number.isFinite(obj.barCount) ? obj.barCount : 0,
    sampleCount: typeof obj.sampleCount === 'number' && Number.isFinite(obj.sampleCount) ? obj.sampleCount : 0,
    historicalExampleCount: toOptionalNumber(obj.historicalExampleCount),
    feedbackExampleCount: toOptionalNumber(obj.feedbackExampleCount),
    manualFeedbackExamples: toOptionalNumber(obj.manualFeedbackExamples),
    autoFeedbackExamples: toOptionalNumber(obj.autoFeedbackExamples),
    preferenceFeedbackExamples: toOptionalNumber(obj.preferenceFeedbackExamples),
    trainExampleCount:
      typeof obj.trainExampleCount === 'number' && Number.isFinite(obj.trainExampleCount)
        ? obj.trainExampleCount
        : 0,
    validationExampleCount:
      typeof obj.validationExampleCount === 'number' && Number.isFinite(obj.validationExampleCount)
        ? obj.validationExampleCount
        : 0,
    modelId: typeof obj.modelId === 'string' ? obj.modelId : undefined,
    fullHistoryDelta: toOptionalNumber(obj.fullHistoryDelta),
    validationDelta: toOptionalNumber(obj.validationDelta),
    championWinRate: toOptionalNumber(obj.championWinRate),
    challengerWinRate: toOptionalNumber(obj.challengerWinRate),
    promotionDelta: toOptionalNumber(obj.promotionDelta),
    promoted: typeof obj.promoted === 'boolean' ? obj.promoted : undefined,
    promotionReason: typeof obj.promotionReason === 'string' ? obj.promotionReason : undefined,
    evaluationSet:
      obj.evaluationSet === 'validation' || obj.evaluationSet === 'train-fallback'
        ? obj.evaluationSet
        : undefined,
    activeModelId: typeof obj.activeModelId === 'string' ? obj.activeModelId : undefined,
    activeFullHistoryDelta: toOptionalNumber(obj.activeFullHistoryDelta),
    activeEvaluationDelta: toOptionalNumber(obj.activeEvaluationDelta),
    trainedAt: typeof obj.trainedAt === 'string' ? obj.trainedAt : undefined,
    recordedAt
  };
};

const normalizePromotionDecision = (raw: unknown): PromotionDecision | undefined => {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.promoted !== 'boolean' ||
    typeof obj.reason !== 'string' ||
    typeof obj.championModelId !== 'string' ||
    typeof obj.challengerModelId !== 'string' ||
    typeof obj.championWinRate !== 'number' ||
    typeof obj.challengerWinRate !== 'number' ||
    typeof obj.delta !== 'number' ||
    typeof obj.decidedAt !== 'string'
  ) {
    return undefined;
  }

  return {
    promoted: obj.promoted,
    reason: obj.reason,
    evaluationSet: obj.evaluationSet === 'train-fallback' ? 'train-fallback' : 'validation',
    championModelId: obj.championModelId,
    challengerModelId: obj.challengerModelId,
    championWinRate: obj.championWinRate,
    challengerWinRate: obj.challengerWinRate,
    delta: obj.delta,
    decidedAt: obj.decidedAt
  };
};

export class ContinuousTrainingService {
  private started = false;
  private trainTimer: NodeJS.Timeout | undefined;
  private pollTimer: NodeJS.Timeout | undefined;
  private pollInProgress = false;
  private trainingInProgress = false;
  private barsByKey = new Map<string, OneMinuteBar>();
  private newBarsSinceTrain = 0;
  private ingestCount = 0;
  private dedupeCount = 0;
  private bootstrapCsvFiles = 0;
  private pollIngestCount = 0;
  private lastError: string | undefined;
  private trainRuns = 0;
  private lastRun: TrainingRunResult | undefined;
  private history: TrainingRunHistoryEntry[] = [];
  private nextRetrainWindowAt: string | undefined;
  private lastExecutedTrainAtMs = 0;
  private feedbackCounts: LearningFeedbackCounts = {
    totalExamples: 0,
    marketExamples: 0,
    preferenceExamples: 0,
    manualOutcomeExamples: 0,
    autoOutcomeExamples: 0,
    manualPreferenceExamples: 0,
    resolvedReviews: 0,
    manualResolvedReviews: 0,
    autoResolvedReviews: 0,
    pendingOutcomeReviews: 0
  };
  private promotions = 0;
  private blockedPromotions = 0;
  private lastPromotionDecision: PromotionDecision | undefined;

  constructor(
    private readonly modelStore: RankingModelStore,
    private readonly config: ContinuousTrainingConfig
  ) {}

  private historyLimit(): number {
    return Number.isFinite(this.config.historyLimit) && this.config.historyLimit > 0
      ? Math.floor(this.config.historyLimit)
      : 25;
  }

  private sortedBars(): OneMinuteBar[] {
    return [...this.barsByKey.values()].sort((a, b) => {
      const byTs = a.timestamp.localeCompare(b.timestamp);
      if (byTs !== 0) {
        return byTs;
      }
      return a.symbol.localeCompare(b.symbol);
    });
  }

  private latestBarTimestamp(): string | undefined {
    let latest: string | undefined;
    for (const bar of this.barsByKey.values()) {
      if (!latest || bar.timestamp > latest) {
        latest = bar.timestamp;
      }
    }
    return latest;
  }

  private resolveLastExecutedTrainAtMs(): number {
    const latestHistoryTrainedAt = this.history.find((entry) => entry.executed && typeof entry.trainedAt === 'string')?.trainedAt;
    const candidates = [latestHistoryTrainedAt, this.modelStore.get().trainedAt];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return 0;
  }

  private setNextRetrainWindow(baseMs: number = Date.now()): void {
    this.nextRetrainWindowAt = new Date(baseMs + this.config.retrainIntervalMs).toISOString();
  }

  private applyMaxBarsLimit(): void {
    if (this.barsByKey.size <= this.config.maxBarsRetained) {
      return;
    }
    const keep = this.sortedBars().slice(-this.config.maxBarsRetained);
    this.barsByKey = new Map(keep.map((bar) => [`${bar.symbol}|${bar.timestamp}`, bar]));
  }

  private async appendArchiveBars(bars: OneMinuteBar[]): Promise<void> {
    if (!this.config.liveArchivePath || bars.length === 0) {
      return;
    }
    const archiveDir = path.dirname(this.config.liveArchivePath);
    await fs.mkdir(archiveDir, { recursive: true });
    const payload = `${bars.map((bar) => JSON.stringify(bar)).join('\n')}\n`;
    await fs.appendFile(this.config.liveArchivePath, payload, 'utf8');
  }

  private async loadArchiveBars(): Promise<void> {
    if (!this.config.liveArchivePath) {
      return;
    }
    const exists = await fs
      .stat(this.config.liveArchivePath)
      .then((stats) => stats.isFile())
      .catch(() => false);
    if (!exists) {
      return;
    }
    const raw = await fs.readFile(this.config.liveArchivePath, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const parsed: OneMinuteBar[] = [];
    for (const line of lines) {
      try {
        parsed.push(normalizeBar(JSON.parse(line)));
      } catch {
        // Ignore malformed archived rows and continue.
      }
    }

    for (const bar of dedupeBars(parsed)) {
      this.barsByKey.set(`${bar.symbol}|${bar.timestamp}`, bar);
    }
    this.applyMaxBarsLimit();
  }

  private async loadBootstrapHistory(): Promise<void> {
    if (!this.config.bootstrapCsvDir) {
      return;
    }
    const dirExists = await fs
      .stat(this.config.bootstrapCsvDir)
      .then((stats) => stats.isDirectory())
      .catch(() => false);
    if (!dirExists) {
      return;
    }

    const files = await listCsvFiles(this.config.bootstrapCsvDir, this.config.bootstrapRecursive);
    const minuteFiles = files.filter((file) => isLikelyOneMinuteCsv(file));
    this.bootstrapCsvFiles = minuteFiles.length;
    for (const file of minuteFiles) {
      const csv = await fs.readFile(file, 'utf8');
      const bars = parseOneMinuteCsv(csv, inferSymbolFromFileName(file));
      for (const bar of bars) {
        this.barsByKey.set(`${bar.symbol}|${bar.timestamp}`, bar);
      }
    }
    this.applyMaxBarsLimit();
  }

  private async pollFeedOnce(): Promise<void> {
    if (!this.config.pollUrl || this.pollInProgress) {
      return;
    }
    this.pollInProgress = true;
    try {
      const headers: Record<string, string> = {};
      if (this.config.pollApiKey) {
        headers[this.config.pollApiKeyHeader ?? 'x-api-key'] = this.config.pollApiKey;
      }

      const response = await fetch(this.config.pollUrl, { headers });
      if (!response.ok) {
        throw new Error(`Polling feed returned HTTP ${response.status}`);
      }
      const payload = (await response.json()) as unknown;
      const rows =
        Array.isArray(payload)
          ? payload
          : payload && typeof payload === 'object' && Array.isArray((payload as Record<string, unknown>).bars)
            ? ((payload as Record<string, unknown>).bars as unknown[])
            : [];

      const bars = rows.map((row) => normalizeBar(row));
      const ingest = await this.ingestBars(bars, 'poll');
      this.pollIngestCount += ingest.accepted;
    } catch (error) {
      this.lastError = (error as Error).message;
    } finally {
      this.pollInProgress = false;
    }
  }

  private async persistModelEnvelope(
    outputPath: string | undefined,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!outputPath) {
      return;
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  private async loadTrainingHistory(): Promise<void> {
    if (!this.config.historyOutputPath) {
      return;
    }
    const exists = await fs
      .stat(this.config.historyOutputPath)
      .then((stats) => stats.isFile())
      .catch(() => false);
    if (!exists) {
      return;
    }

    try {
      const raw = JSON.parse(await fs.readFile(this.config.historyOutputPath, 'utf8')) as unknown;
      const envelope =
        raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>).history)
          ? (raw as Record<string, unknown>)
          : { history: Array.isArray(raw) ? raw : [] };

      this.history = (envelope.history as unknown[])
        .map((entry) => normalizeTrainingRunHistoryEntry(entry))
        .filter((entry): entry is TrainingRunHistoryEntry => entry !== null)
        .slice(0, this.historyLimit());

      this.promotions =
        typeof envelope.promotions === 'number' && Number.isFinite(envelope.promotions)
          ? envelope.promotions
          : this.history.filter((entry) => entry.executed && entry.promoted === true).length;
      this.blockedPromotions =
        typeof envelope.blockedPromotions === 'number' && Number.isFinite(envelope.blockedPromotions)
          ? envelope.blockedPromotions
          : this.history.filter(
              (entry) =>
                entry.executed &&
                entry.promoted === false &&
                typeof entry.promotionReason === 'string' &&
                entry.promotionReason.length > 0
            ).length;
      this.lastPromotionDecision = normalizePromotionDecision(envelope.lastPromotionDecision);
    } catch (error) {
      this.lastError = `Failed to load training history: ${(error as Error).message}`;
    }
  }

  private async persistTrainingHistory(): Promise<void> {
    if (!this.config.historyOutputPath) {
      return;
    }

    await fs.mkdir(path.dirname(this.config.historyOutputPath), { recursive: true });
    const payload: TrainingHistoryStore = {
      history: this.history.slice(0, this.historyLimit()),
      promotions: this.promotions,
      blockedPromotions: this.blockedPromotions,
      lastPromotionDecision: this.lastPromotionDecision
    };
    await fs.writeFile(this.config.historyOutputPath, JSON.stringify(payload, null, 2), 'utf8');
  }

  private async recordRun(run: TrainingRunResult): Promise<void> {
    const recordedRun: TrainingRunHistoryEntry = {
      ...run,
      recordedAt: new Date().toISOString()
    };

    this.history = [
      recordedRun,
      ...this.history
    ].slice(0, this.historyLimit());

    try {
      await this.persistTrainingHistory();
    } catch (error) {
      this.lastError = `Failed to persist training history: ${(error as Error).message}`;
    }

    try {
      await this.config.onRunRecorded?.(recordedRun);
    } catch (error) {
      this.lastError = `Failed to run training notification hook: ${(error as Error).message}`;
    }
  }

  private async retrain(trigger: string, force: boolean): Promise<TrainingRunResult> {
    if (this.trainingInProgress) {
      const skipped = {
        trigger,
        executed: false,
        reason: 'TRAINING_IN_PROGRESS',
        barCount: this.barsByKey.size,
        sampleCount: 0,
        trainExampleCount: 0,
        validationExampleCount: 0
      };
      this.lastRun = skipped;
      await this.recordRun(skipped);
      return skipped;
    }

    const bars = this.sortedBars();
    if (!force && bars.length < this.config.minBarsToTrain) {
      const skipped = {
        trigger,
        executed: false,
        reason: `INSUFFICIENT_BARS_${bars.length}`,
        barCount: bars.length,
        sampleCount: 0,
        trainExampleCount: 0,
        validationExampleCount: 0
      };
      this.lastRun = skipped;
      await this.recordRun(skipped);
      return skipped;
    }

    if (!force && this.lastExecutedTrainAtMs > 0) {
      const now = Date.now();
      const earliestNextRunAt = this.lastExecutedTrainAtMs + this.config.retrainIntervalMs;
      if (earliestNextRunAt > now) {
        this.setNextRetrainWindow(this.lastExecutedTrainAtMs);
        const skipped = {
          trigger,
          executed: false,
          reason: `RETRAIN_COOLDOWN_${Math.ceil((earliestNextRunAt - now) / 1000)}S`,
          barCount: bars.length,
          sampleCount: 0,
          trainExampleCount: 0,
          validationExampleCount: 0
        };
        this.lastRun = skipped;
        await this.recordRun(skipped);
        return skipped;
      }
    }

    this.trainingInProgress = true;
    try {
      const historicalExamples = buildTrainingExamplesFromOneMinuteBars(bars, this.config.trainingOptions);
      const feedbackDataset =
        (await this.config.feedbackDatasetProvider?.()) ?? {
          examples: [],
          counts: {
            totalExamples: 0,
            marketExamples: 0,
            preferenceExamples: 0,
            manualOutcomeExamples: 0,
            autoOutcomeExamples: 0,
            manualPreferenceExamples: 0,
            resolvedReviews: 0,
            manualResolvedReviews: 0,
            autoResolvedReviews: 0,
            pendingOutcomeReviews: 0
          }
        };
      this.feedbackCounts = feedbackDataset.counts;

      const examples = [...historicalExamples, ...feedbackDataset.examples];
      if (examples.length < this.config.minExamplesToTrain) {
        const skipped: TrainingRunResult = {
          trigger,
          executed: false,
          reason: `INSUFFICIENT_EXAMPLES_${examples.length}`,
          barCount: bars.length,
          sampleCount: examples.length,
          historicalExampleCount: historicalExamples.length,
          feedbackExampleCount: feedbackDataset.examples.length,
          manualFeedbackExamples:
            feedbackDataset.counts.manualOutcomeExamples + feedbackDataset.counts.manualPreferenceExamples,
          autoFeedbackExamples: feedbackDataset.counts.autoOutcomeExamples,
          preferenceFeedbackExamples: feedbackDataset.counts.preferenceExamples,
          trainExampleCount: 0,
          validationExampleCount: 0
        };
        this.lastRun = skipped;
        await this.recordRun(skipped);
        return skipped;
      }

      const { trainExamples, validationExamples } = splitExamples(examples, this.config.validationPct);
      const challengerValidationModel = trainRankingModelFromExamples(trainExamples);
      const trainMetrics = evaluateExamples(trainExamples, challengerValidationModel);
      const validationMetrics =
        validationExamples.length > 0 ? evaluateExamples(validationExamples, challengerValidationModel) : null;

      const evaluationExamples =
        validationExamples.length > 0 && evaluateTopPickWinRate(validationExamples, challengerValidationModel).topPickCount >= this.config.minEvaluationTopPicks
          ? validationExamples
          : trainExamples;
      const evaluationSet: 'validation' | 'train-fallback' =
        evaluationExamples === validationExamples ? 'validation' : 'train-fallback';

      const championModel = this.modelStore.get();
      const promotionMetrics = compareModels(evaluationExamples, championModel, challengerValidationModel);
      const alwaysPromoteLatestModel = this.config.alwaysPromoteLatestModel ?? false;
      const validatedImprovement = promotionMetrics.delta >= this.config.promotionMinDelta;
      const promotionDecision: PromotionDecision = {
        promoted: alwaysPromoteLatestModel || validatedImprovement,
        reason:
          validatedImprovement
            ? 'VALIDATED_IMPROVEMENT'
            : alwaysPromoteLatestModel
              ? `LATEST_RETRAIN_LIVE_${promotionMetrics.delta.toFixed(4)}`
              : `DELTA_BELOW_THRESHOLD_${promotionMetrics.delta.toFixed(4)}`,
        evaluationSet,
        championModelId: championModel.modelId,
        challengerModelId: challengerValidationModel.modelId,
        championWinRate: promotionMetrics.championTopPick.winRate,
        challengerWinRate: promotionMetrics.challengerTopPick.winRate,
        delta: promotionMetrics.delta,
        decidedAt: new Date().toISOString()
      };

      const finalChallengerModel = trainRankingModelFromExamples(examples);
      const fullHistoryMetrics = evaluateExamples(examples, finalChallengerModel);
      if (promotionDecision.promoted) {
        this.modelStore.set(finalChallengerModel);
        this.promotions += 1;
      } else {
        this.blockedPromotions += 1;
      }
      this.lastPromotionDecision = {
        ...promotionDecision,
        challengerModelId: finalChallengerModel.modelId
      };
      this.newBarsSinceTrain = 0;
      this.trainRuns += 1;
      this.lastError = undefined;
      this.lastExecutedTrainAtMs = Date.parse(finalChallengerModel.trainedAt) || Date.now();
      this.setNextRetrainWindow(this.lastExecutedTrainAtMs);

      const activeModel = this.modelStore.get();
      const activeFullHistoryMetrics = evaluateExamples(examples, activeModel);
      const activeEvaluationMetrics = evaluateExamples(evaluationExamples, activeModel);
      const summaryPayload = {
        fullHistory: fullHistoryMetrics,
        train: trainMetrics,
        validation: validationMetrics,
        activeModel: {
          fullHistory: activeFullHistoryMetrics,
          evaluation: activeEvaluationMetrics
        },
        barCount: bars.length,
        sampleCount: examples.length,
        historicalExampleCount: historicalExamples.length,
        feedbackExampleCount: feedbackDataset.examples.length,
        feedback: feedbackDataset.counts,
        trainExampleCount: trainExamples.length,
        validationExampleCount: validationExamples.length,
        trigger,
        promotion: this.lastPromotionDecision,
        activeModelId: activeModel.modelId
      };

      await this.persistModelEnvelope(this.config.modelOutputPath, {
        model: activeModel,
        challengerModel: finalChallengerModel,
        summary: summaryPayload
      });
      await this.persistModelEnvelope(this.config.challengerOutputPath, {
        model: finalChallengerModel,
        summary: summaryPayload
      });

      const result: TrainingRunResult = {
        trigger,
        executed: true,
        barCount: bars.length,
        sampleCount: examples.length,
        historicalExampleCount: historicalExamples.length,
        feedbackExampleCount: feedbackDataset.examples.length,
        manualFeedbackExamples:
          feedbackDataset.counts.manualOutcomeExamples + feedbackDataset.counts.manualPreferenceExamples,
        autoFeedbackExamples: feedbackDataset.counts.autoOutcomeExamples,
        preferenceFeedbackExamples: feedbackDataset.counts.preferenceExamples,
        trainExampleCount: trainExamples.length,
        validationExampleCount: validationExamples.length,
        modelId: finalChallengerModel.modelId,
        fullHistoryDelta: fullHistoryMetrics.delta,
        validationDelta: validationMetrics?.delta,
        championWinRate: promotionMetrics.championTopPick.winRate,
        challengerWinRate: promotionMetrics.challengerTopPick.winRate,
        promotionDelta: promotionMetrics.delta,
        promoted: this.lastPromotionDecision.promoted,
        promotionReason: this.lastPromotionDecision.reason,
        evaluationSet,
        activeModelId: activeModel.modelId,
        activeFullHistoryDelta: activeFullHistoryMetrics.delta,
        activeEvaluationDelta: activeEvaluationMetrics.delta,
        trainedAt: finalChallengerModel.trainedAt
      };
      this.lastRun = result;
      await this.recordRun(result);
      return result;
    } catch (error) {
      this.lastError = (error as Error).message;
      const failed: TrainingRunResult = {
        trigger,
        executed: false,
        reason: this.lastError,
        barCount: bars.length,
        sampleCount: 0,
        trainExampleCount: 0,
        validationExampleCount: 0
      };
      this.lastRun = failed;
      await this.recordRun(failed);
      return failed;
    } finally {
      this.trainingInProgress = false;
    }
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.started) {
      return;
    }
    this.started = true;

    await this.loadTrainingHistory();
    this.lastExecutedTrainAtMs = this.resolveLastExecutedTrainAtMs();
    await this.loadBootstrapHistory();
    await this.loadArchiveBars();
    await this.retrain('startup', false);
    this.setNextRetrainWindow(this.lastExecutedTrainAtMs || Date.now());

    this.trainTimer = setInterval(() => {
      if (this.newBarsSinceTrain < this.config.minNewBarsForRetrain) {
        return;
      }
      void this.retrain('interval', false);
    }, this.config.retrainIntervalMs);

    if (this.config.pollUrl) {
      this.pollTimer = setInterval(() => {
        void this.pollFeedOnce();
      }, this.config.pollIntervalMs);
      void this.pollFeedOnce();
    }
  }

  stop(): void {
    this.started = false;
    if (this.trainTimer) {
      clearInterval(this.trainTimer);
      this.trainTimer = undefined;
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.nextRetrainWindowAt = undefined;
  }

  async ingestBars(rawBars: unknown[], source: 'api' | 'poll' = 'api'): Promise<{
    accepted: number;
    deduped: number;
    barCount: number;
    latestBarTimestamp?: string;
  }> {
    const bars = dedupeBars(rawBars.map((bar) => normalizeBar(bar)));
    const accepted: OneMinuteBar[] = [];
    let deduped = 0;

    for (const bar of bars) {
      const key = `${bar.symbol}|${bar.timestamp}`;
      if (this.barsByKey.has(key)) {
        deduped += 1;
        continue;
      }
      this.barsByKey.set(key, bar);
      accepted.push(bar);
    }

    this.ingestCount += accepted.length;
    this.dedupeCount += deduped;
    this.newBarsSinceTrain += accepted.length;
    this.applyMaxBarsLimit();
    await this.appendArchiveBars(accepted);

    return {
      accepted: accepted.length,
      deduped,
      barCount: this.barsByKey.size,
      latestBarTimestamp: this.latestBarTimestamp()
    };
  }

  async forceRetrain(): Promise<TrainingRunResult> {
    return this.retrain('manual', true);
  }

  status(): ContinuousTrainingStatus {
    const currentModel = this.modelStore.get();
    const executedHistory = this.history.filter((entry) => entry.executed);
    const activeEntry = executedHistory.find((entry) => entry.activeModelId === currentModel.modelId);
    const fullHistoryDeltas = executedHistory
      .map((entry) => entry.fullHistoryDelta)
      .filter((value): value is number => typeof value === 'number');
    const validationDeltas = executedHistory
      .map((entry) => entry.validationDelta)
      .filter((value): value is number => typeof value === 'number');
    const recentValidationDeltas = validationDeltas.slice(0, 5);
    const lastPromotedAt = executedHistory.find((entry) => entry.promoted)?.trainedAt;

    return {
      enabled: this.config.enabled,
      started: this.started,
      ingestCount: this.ingestCount,
      dedupeCount: this.dedupeCount,
      barCount: this.barsByKey.size,
      latestBarTimestamp: this.latestBarTimestamp(),
      trainRuns: this.trainRuns,
      lastTrainedAt: currentModel.trainedAt,
      lastError: this.lastError,
      trainingInProgress: this.trainingInProgress,
      newBarsSinceTrain: this.newBarsSinceTrain,
      model: {
        modelId: currentModel.modelId,
        sampleCount: currentModel.sampleCount,
        trainedAt: currentModel.trainedAt
      },
      feedback: this.feedbackCounts,
      promotion: {
        activeModelId: currentModel.modelId,
        promotionMinDelta: this.config.promotionMinDelta,
        minEvaluationTopPicks: this.config.minEvaluationTopPicks,
        alwaysPromoteLatestModel: this.config.alwaysPromoteLatestModel ?? false,
        promotions: this.promotions,
        blockedPromotions: this.blockedPromotions,
        lastDecision: this.lastPromotionDecision
      },
      cadence: {
        retrainIntervalMinutes: Math.round(this.config.retrainIntervalMs / 60_000),
        minNewBarsForRetrain: this.config.minNewBarsForRetrain,
        barsNeededForNextRetrain: Math.max(0, this.config.minNewBarsForRetrain - this.newBarsSinceTrain),
        nextWindowAt: this.nextRetrainWindowAt
      },
      data: {
        bootstrapCsvFiles: this.bootstrapCsvFiles,
        pollIngestCount: this.pollIngestCount,
        archivePath: this.config.liveArchivePath,
        modelOutputPath: this.config.modelOutputPath,
        challengerOutputPath: this.config.challengerOutputPath,
        historyOutputPath: this.config.historyOutputPath,
        bootstrapTimeframe: '1m',
        analysisTimeframes: [...ANALYSIS_TIMEFRAMES]
      },
      progress: {
        historyCount: this.history.length,
        lastPromotedAt,
        bestFullHistoryDelta: fullHistoryDeltas.length > 0 ? Math.max(...fullHistoryDeltas) : undefined,
        bestValidationDelta: validationDeltas.length > 0 ? Math.max(...validationDeltas) : undefined,
        averageValidationDeltaLast5:
          recentValidationDeltas.length > 0
            ? recentValidationDeltas.reduce((sum, value) => sum + value, 0) / recentValidationDeltas.length
            : undefined,
        activeFullHistoryDelta: activeEntry?.activeFullHistoryDelta,
        activeEvaluationDelta: activeEntry?.activeEvaluationDelta
      },
      lastRun: this.lastRun,
      history: [...this.history]
    };
  }
}
