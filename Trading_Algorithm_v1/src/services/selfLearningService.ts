import type { SetupCandidate, Side, SymbolCode } from '../domain/types.js';
import type { ResearchTrendDirection } from './marketResearchService.js';
import type { PaperAutonomyThesis } from './paperAutonomyService.js';
import type { TradeLearningRecord } from '../stores/tradeLearningStore.js';

interface OutcomeCounts {
  resolved: number;
  wins: number;
  losses: number;
  breakeven: number;
  totalR: number;
}

interface MutableReasonCounts {
  key: string;
  count: number;
}

export interface SelfLearningReasonBucket {
  key: string;
  count: number;
}

export interface SelfLearningBucket {
  key: string;
  label: string;
  resolved: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  avgR: number;
  scoreAdjustment: number;
  confidence: number;
  riskMultiplier: number;
}

export interface SelfLearningProfile {
  generatedAt: string;
  totalRecords: number;
  resolvedRecords: number;
  recentResolvedRecords: number;
  recentWindowDays: number;
  topWinReasons: SelfLearningReasonBucket[];
  topLossReasons: SelfLearningReasonBucket[];
  bySetup: SelfLearningBucket[];
  bySymbol: SelfLearningBucket[];
  bySetupSymbol: SelfLearningBucket[];
  bySide: SelfLearningBucket[];
  byResearchDirection: SelfLearningBucket[];
  byAutonomyThesis: SelfLearningBucket[];
}

export interface SelfLearningStatus {
  enabled: boolean;
  started: boolean;
  lastRefreshedAt?: string;
  lastError?: string;
  refreshIntervalMinutes: number;
  minResolvedRecords: number;
  minBucketSamples: number;
  recentWindowDays: number;
  profile: SelfLearningProfile;
}

export interface SelfLearningSignalAdjustment {
  scoreAdjustment: number;
  confidence: number;
  summary: string;
  components: string[];
}

export interface SelfLearningAutonomyAdjustment {
  scoreAdjustment: number;
  confidence: number;
  riskMultiplier: number;
  summary: string;
  components: string[];
}

export interface SelfLearningConfig {
  enabled: boolean;
  refreshIntervalMs: number;
  minResolvedRecords: number;
  minBucketSamples: number;
  recentWindowDays: number;
  maxReasonBuckets: number;
  recordsProvider: () => Promise<TradeLearningRecord[]> | TradeLearningRecord[];
}

type LearningOutcome = 'WIN' | 'LOSS' | 'FLAT';

type MutableBucketMap = Map<string, OutcomeCounts>;

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

const bucketLabel = (key: string): string => key;

const emptyProfile = (recentWindowDays: number): SelfLearningProfile => ({
  generatedAt: new Date(0).toISOString(),
  totalRecords: 0,
  resolvedRecords: 0,
  recentResolvedRecords: 0,
  recentWindowDays,
  topWinReasons: [],
  topLossReasons: [],
  bySetup: [],
  bySymbol: [],
  bySetupSymbol: [],
  bySide: [],
  byResearchDirection: [],
  byAutonomyThesis: []
});

const resolveOutcome = (record: TradeLearningRecord): LearningOutcome | null => {
  const outcome = record.review.effectiveOutcome;
  if (outcome === 'WOULD_WIN') {
    return 'WIN';
  }
  if (outcome === 'WOULD_LOSE') {
    return 'LOSS';
  }
  if (outcome === 'BREAKEVEN') {
    return 'FLAT';
  }
  if (record.paperTrade?.closedAt) {
    const realizedR = typeof record.paperTrade.realizedR === 'number' ? record.paperTrade.realizedR : 0;
    if (realizedR > 0) {
      return 'WIN';
    }
    if (realizedR < 0) {
      return 'LOSS';
    }
    return 'FLAT';
  }
  return null;
};

const pushBucket = (
  map: MutableBucketMap,
  key: string | undefined,
  outcome: LearningOutcome,
  realizedR: number
): void => {
  if (!key) {
    return;
  }
  const current = map.get(key) ?? {
    resolved: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    totalR: 0
  };
  current.resolved += 1;
  current.wins += outcome === 'WIN' ? 1 : 0;
  current.losses += outcome === 'LOSS' ? 1 : 0;
  current.breakeven += outcome === 'FLAT' ? 1 : 0;
  current.totalR += realizedR;
  map.set(key, current);
};

const pushReason = (reasons: Map<string, MutableReasonCounts>, values: string[]): void => {
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const current = reasons.get(trimmed) ?? { key: trimmed, count: 0 };
    current.count += 1;
    reasons.set(trimmed, current);
  }
};

const finalizeReasonBuckets = (map: Map<string, MutableReasonCounts>, maxBuckets: number): SelfLearningReasonBucket[] =>
  [...map.values()]
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, maxBuckets)
    .map((entry) => ({ key: entry.key, count: entry.count }));

const finalizeBuckets = (
  map: MutableBucketMap,
  minBucketSamples: number
): SelfLearningBucket[] =>
  [...map.entries()]
    .map(([key, counts]) => {
      const winRate = counts.resolved > 0 ? counts.wins / counts.resolved : 0;
      const edge = winRate - 0.5;
      const confidence = clamp(counts.resolved / Math.max(minBucketSamples * 2, 1), 0, 1);
      const scoreAdjustment = counts.resolved >= minBucketSamples
        ? round(clamp(edge * 10 * confidence, -3.5, 3.5), 2)
        : 0;
      const riskMultiplier = counts.resolved >= minBucketSamples
        ? round(clamp(1 + edge * 0.7 * confidence, 0.7, 1.3), 2)
        : 1;
      return {
        key,
        label: bucketLabel(key),
        resolved: counts.resolved,
        wins: counts.wins,
        losses: counts.losses,
        breakeven: counts.breakeven,
        winRate: round(winRate, 3),
        avgR: counts.resolved > 0 ? round(counts.totalR / counts.resolved, 2) : 0,
        scoreAdjustment,
        confidence: round(confidence, 2),
        riskMultiplier
      };
    })
    .sort((left, right) => Math.abs(right.scoreAdjustment) - Math.abs(left.scoreAdjustment) || right.resolved - left.resolved || left.label.localeCompare(right.label));

const findBucket = (buckets: SelfLearningBucket[], key: string | undefined): SelfLearningBucket | null => {
  if (!key) {
    return null;
  }
  return buckets.find((entry) => entry.key === key) ?? null;
};

const formatComponent = (label: string, bucket: SelfLearningBucket): string => {
  const sign = bucket.scoreAdjustment > 0 ? '+' : '';
  return `${label} ${sign}${bucket.scoreAdjustment.toFixed(1)} over ${bucket.resolved} trades (${Math.round(bucket.winRate * 100)}%)`;
};

const uniqueStrings = (values: Array<string | null | undefined>): string[] => [...new Set(values.filter((value): value is string => Boolean(value)))];

export class SelfLearningService {
  private started = false;
  private interval: NodeJS.Timeout | undefined;
  private refreshPromise: Promise<void> | null = null;
  private refreshQueued = false;
  private lastRefreshedAt: string | undefined;
  private lastError: string | undefined;
  private profile: SelfLearningProfile;

  constructor(private readonly config: SelfLearningConfig) {
    this.profile = emptyProfile(config.recentWindowDays);
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.started) {
      return;
    }
    this.started = true;
    await this.refresh();
    this.interval = setInterval(() => {
      void this.refresh().catch((error) => {
        this.lastError = error instanceof Error ? error.message : 'Self-learning refresh failed';
      });
    }, this.config.refreshIntervalMs);
  }

  stop(): void {
    this.started = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  queueRefresh(): void {
    void this.refresh().catch((error) => {
      this.lastError = error instanceof Error ? error.message : 'Self-learning refresh failed';
    });
  }

  async refresh(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }
    if (this.refreshPromise) {
      this.refreshQueued = true;
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = (async () => {
      do {
        this.refreshQueued = false;
        const records = await this.config.recordsProvider();
        this.profile = this.buildProfile(records);
        this.lastRefreshedAt = new Date().toISOString();
        this.lastError = undefined;
      } while (this.refreshQueued);
    })();

    try {
      await this.refreshPromise;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Self-learning refresh failed';
      throw error;
    } finally {
      this.refreshPromise = null;
    }
  }

  status(): SelfLearningStatus {
    return {
      enabled: this.config.enabled,
      started: this.started,
      lastRefreshedAt: this.lastRefreshedAt,
      lastError: this.lastError,
      refreshIntervalMinutes: Math.max(1, Math.round(this.config.refreshIntervalMs / 60_000)),
      minResolvedRecords: this.config.minResolvedRecords,
      minBucketSamples: this.config.minBucketSamples,
      recentWindowDays: this.config.recentWindowDays,
      profile: structuredClone(this.profile)
    };
  }

  scoreSignalCandidate(candidate: SetupCandidate): SelfLearningSignalAdjustment {
    const profile = this.profile;
    if (profile.resolvedRecords < this.config.minResolvedRecords) {
      return {
        scoreAdjustment: 0,
        confidence: 0,
        summary: 'Self-learning is still gathering enough resolved trades.',
        components: []
      };
    }

    const researchDirection = typeof candidate.metadata.researchTrendDirection === 'string'
      ? candidate.metadata.researchTrendDirection as ResearchTrendDirection
      : undefined;
    const setupSymbolKey = `${candidate.setupType}|${candidate.symbol}`;
    const components = [
      { label: 'setup+symbol', bucket: findBucket(profile.bySetupSymbol, setupSymbolKey), weight: 1 },
      { label: 'setup', bucket: findBucket(profile.bySetup, candidate.setupType), weight: 0.8 },
      { label: 'symbol', bucket: findBucket(profile.bySymbol, candidate.symbol), weight: 0.55 },
      { label: 'side', bucket: findBucket(profile.bySide, candidate.side), weight: 0.35 },
      {
        label: 'research',
        bucket: researchDirection === 'BULLISH' || researchDirection === 'BEARISH'
          ? findBucket(profile.byResearchDirection, researchDirection)
          : null,
        weight: 0.5
      }
    ].filter((entry) => entry.bucket && entry.bucket.resolved >= this.config.minBucketSamples);

    if (components.length === 0) {
      return {
        scoreAdjustment: 0,
        confidence: 0,
        summary: 'Self-learning does not have a strong edge for this setup yet.',
        components: []
      };
    }

    const scoreAdjustment = round(
      clamp(
        components.reduce((sum, entry) => sum + ((entry.bucket?.scoreAdjustment ?? 0) * entry.weight), 0),
        -4,
        4
      ),
      2
    );
    const confidence = round(average(components.map((entry) => entry.bucket?.confidence ?? 0)), 2);
    const componentText = components.map((entry) => formatComponent(entry.label, entry.bucket as SelfLearningBucket));

    return {
      scoreAdjustment,
      confidence,
      summary: componentText.join(' • '),
      components: componentText
    };
  }

  scoreAutonomyIdea(input: {
    thesis: PaperAutonomyThesis;
    symbol: SymbolCode;
    side: Side;
    researchDirection?: ResearchTrendDirection;
  }): SelfLearningAutonomyAdjustment {
    const profile = this.profile;
    if (profile.resolvedRecords < this.config.minResolvedRecords) {
      return {
        scoreAdjustment: 0,
        confidence: 0,
        riskMultiplier: 1,
        summary: 'Self-learning is still gathering enough resolved trades.',
        components: []
      };
    }

    const components = [
      { label: 'thesis', bucket: findBucket(profile.byAutonomyThesis, input.thesis), weight: 1 },
      { label: 'symbol', bucket: findBucket(profile.bySymbol, input.symbol), weight: 0.55 },
      { label: 'side', bucket: findBucket(profile.bySide, input.side), weight: 0.35 },
      {
        label: 'research',
        bucket: input.researchDirection === 'BULLISH' || input.researchDirection === 'BEARISH'
          ? findBucket(profile.byResearchDirection, input.researchDirection)
          : null,
        weight: 0.4
      }
    ].filter((entry) => entry.bucket && entry.bucket.resolved >= this.config.minBucketSamples);

    if (components.length === 0) {
      return {
        scoreAdjustment: 0,
        confidence: 0,
        riskMultiplier: 1,
        summary: 'Self-learning does not have a strong autonomous edge yet.',
        components: []
      };
    }

    const rawScore = components.reduce((sum, entry) => sum + ((entry.bucket?.scoreAdjustment ?? 0) * entry.weight), 0);
    const scoreAdjustment = round(clamp(rawScore, -6, 6), 2);
    const confidence = round(average(components.map((entry) => entry.bucket?.confidence ?? 0)), 2);
    const riskMultiplier = round(clamp(1 + rawScore * 0.05, 0.65, 1.2), 2);
    const componentText = components.map((entry) => formatComponent(entry.label, entry.bucket as SelfLearningBucket));

    return {
      scoreAdjustment,
      confidence,
      riskMultiplier,
      summary: componentText.join(' • '),
      components: componentText
    };
  }

  private buildProfile(records: TradeLearningRecord[]): SelfLearningProfile {
    const resolvedRecords = records.filter((record) => resolveOutcome(record) !== null);
    const nowMs = Date.now();
    const recentCutoffMs = nowMs - this.config.recentWindowDays * 24 * 60 * 60_000;
    const recentResolved = resolvedRecords.filter((record) => {
      const updatedMs = Date.parse(record.updatedAt || record.detectedAt);
      return Number.isFinite(updatedMs) && updatedMs >= recentCutoffMs;
    });
    const activeRecords = recentResolved.length >= this.config.minResolvedRecords ? recentResolved : resolvedRecords;

    const bySetup: MutableBucketMap = new Map();
    const bySymbol: MutableBucketMap = new Map();
    const bySetupSymbol: MutableBucketMap = new Map();
    const bySide: MutableBucketMap = new Map();
    const byResearchDirection: MutableBucketMap = new Map();
    const byAutonomyThesis: MutableBucketMap = new Map();
    const winReasons = new Map<string, MutableReasonCounts>();
    const lossReasons = new Map<string, MutableReasonCounts>();

    for (const record of activeRecords) {
      const outcome = resolveOutcome(record);
      if (!outcome) {
        continue;
      }
      const realizedR = typeof record.paperTrade?.realizedR === 'number' ? record.paperTrade.realizedR : 0;
      pushBucket(bySetup, record.setupType, outcome, realizedR);
      pushBucket(bySymbol, record.symbol, outcome, realizedR);
      pushBucket(bySetupSymbol, `${record.setupType}|${record.symbol}`, outcome, realizedR);
      pushBucket(bySide, record.side, outcome, realizedR);
      pushBucket(byResearchDirection, record.research.direction, outcome, realizedR);
      pushBucket(byAutonomyThesis, record.autonomy.thesis, outcome, realizedR);

      if (outcome === 'WIN') {
        pushReason(winReasons, uniqueStrings([
          ...record.reasoning.passReasons,
          ...record.reasoning.why.slice(0, 3),
          record.research.summary,
          record.autonomy.reason
        ]));
      } else if (outcome === 'LOSS') {
        pushReason(lossReasons, uniqueStrings([
          ...record.reasoning.failReasons,
          ...record.reasoning.why.slice(0, 3),
          record.reasoning.reviewNotes,
          record.autonomy.reason
        ]));
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      totalRecords: records.length,
      resolvedRecords: resolvedRecords.length,
      recentResolvedRecords: recentResolved.length,
      recentWindowDays: this.config.recentWindowDays,
      topWinReasons: finalizeReasonBuckets(winReasons, this.config.maxReasonBuckets),
      topLossReasons: finalizeReasonBuckets(lossReasons, this.config.maxReasonBuckets),
      bySetup: finalizeBuckets(bySetup, this.config.minBucketSamples),
      bySymbol: finalizeBuckets(bySymbol, this.config.minBucketSamples),
      bySetupSymbol: finalizeBuckets(bySetupSymbol, this.config.minBucketSamples),
      bySide: finalizeBuckets(bySide, this.config.minBucketSamples),
      byResearchDirection: finalizeBuckets(byResearchDirection, this.config.minBucketSamples),
      byAutonomyThesis: finalizeBuckets(byAutonomyThesis, this.config.minBucketSamples)
    };
  }
}

const average = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
