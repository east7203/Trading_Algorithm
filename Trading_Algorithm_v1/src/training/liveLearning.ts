import type {
  SetupType,
  SignalReviewEntry,
  SignalReviewOutcome,
  SignalReviewOutcomeSource,
  SymbolCode
} from '../domain/types.js';
import type { TradeLearningRecord } from '../stores/tradeLearningStore.js';
import type { TrainingExample, TrainingOutcome } from './historicalTrainer.js';

export const isManualEngineTradeLearningRecord = (record: TradeLearningRecord): boolean => {
  const alertSource = record.alertSnapshot?.source;
  if (alertSource === 'MANUAL_ENGINE') {
    return true;
  }
  if (alertSource === 'MANUAL_TEST' || alertSource === 'PAPER_AUTONOMY') {
    return false;
  }
  return record.source === 'signal-monitor';
};

export const isAutonomyTradeLearningRecord = (record: TradeLearningRecord): boolean => {
  const alertSource = record.alertSnapshot?.source;
  if (alertSource === 'PAPER_AUTONOMY') {
    return true;
  }
  if (alertSource === 'MANUAL_ENGINE' || alertSource === 'MANUAL_TEST') {
    return false;
  }
  return record.source === 'paper-autonomy' || record.source === 'signal-monitor-autonomous';
};

export interface LearningFeedbackCounts {
  totalExamples: number;
  marketExamples: number;
  preferenceExamples: number;
  manualOutcomeExamples: number;
  autoOutcomeExamples: number;
  manualPreferenceExamples: number;
  resolvedReviews: number;
  manualResolvedReviews: number;
  autoResolvedReviews: number;
  pendingOutcomeReviews: number;
}

export interface LearningFeedbackDataset {
  examples: TrainingExample[];
  counts: LearningFeedbackCounts;
}

export interface LearningPerformanceBucket {
  key: string;
  label: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
}

export interface LearningPerformanceSummary {
  resolvedReviews: number;
  pendingOutcomeReviews: number;
  manualResolvedReviews: number;
  autoResolvedReviews: number;
  winRate: number;
  bySetup: LearningPerformanceBucket[];
  byTimeBucket: LearningPerformanceBucket[];
  byScoreBucket: LearningPerformanceBucket[];
  byDetectionTimeframe: LearningPerformanceBucket[];
  byExecutionTimeframe: LearningPerformanceBucket[];
  byResearchAlignment: LearningPerformanceBucket[];
  blockedVsReady: {
    readyResolved: number;
    blockedResolved: number;
    readyWinRate: number;
    blockedWinRate: number;
  };
  preference: {
    validVotes: number;
    invalidVotes: number;
    preferredSetups: string[];
    preferredSymbols: string[];
  };
}

interface EffectiveOutcomeResolution {
  outcome?: SignalReviewOutcome;
  source: SignalReviewOutcomeSource;
}

const WIN_LOSS_OUTCOMES = new Set<SignalReviewOutcome>(['WOULD_WIN', 'WOULD_LOSE']);

const toTrainingOutcome = (outcome: SignalReviewOutcome | undefined): TrainingOutcome | null => {
  if (outcome === 'WOULD_WIN') {
    return 'WIN';
  }
  if (outcome === 'WOULD_LOSE') {
    return 'LOSS';
  }
  return null;
};

const cloneCandidate = <T>(value: T): T => structuredClone(value);

const labelForTimeBucket = (isoTimestamp: string): string => {
  const hour = new Date(isoTimestamp).getUTCHours();
  if (hour < 15) {
    return 'Opening Hour';
  }
  if (hour < 17) {
    return 'Late Morning';
  }
  return 'Off Window';
};

const labelForScoreBucket = (score: number): string => {
  if (score >= 85) {
    return '85+';
  }
  if (score >= 78) {
    return '78-84.9';
  }
  return '70-77.9';
};

const normalizeAlertTimeframe = (value: string | undefined): string => {
  if (!value || value === '15m' || value === '5m') {
    return '5m';
  }

  return value;
};

const pushBucket = (
  map: Map<string, { wins: number; losses: number }>,
  key: string,
  isWin: boolean
): void => {
  const current = map.get(key) ?? { wins: 0, losses: 0 };
  map.set(key, {
    wins: current.wins + (isWin ? 1 : 0),
    losses: current.losses + (isWin ? 0 : 1)
  });
};

const summarizeBuckets = (
  map: Map<string, { wins: number; losses: number }>,
  labelBuilder: (key: string) => string = (key) => key
): LearningPerformanceBucket[] =>
  [...map.entries()]
    .map(([key, counts]) => {
      const total = counts.wins + counts.losses;
      return {
        key,
        label: labelBuilder(key),
        wins: counts.wins,
        losses: counts.losses,
        total,
        winRate: total > 0 ? counts.wins / total : 0
      };
    })
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.winRate - a.winRate || b.total - a.total || a.label.localeCompare(b.label));

export const resolveEffectiveReviewOutcome = (review: SignalReviewEntry): EffectiveOutcomeResolution => {
  if (review.outcome) {
    return {
      outcome: review.outcome,
      source: 'MANUAL'
    };
  }

  if (review.autoOutcome) {
    return {
      outcome: review.autoOutcome,
      source: 'AUTO'
    };
  }

  return {
    outcome: undefined,
    source: 'NONE'
  };
};

export const buildLearningFeedbackDataset = (reviews: SignalReviewEntry[]): LearningFeedbackDataset => {
  const examples: TrainingExample[] = [];
  let marketExamples = 0;
  let preferenceExamples = 0;
  let manualOutcomeExamples = 0;
  let autoOutcomeExamples = 0;
  let manualPreferenceExamples = 0;
  let resolvedReviews = 0;
  let manualResolvedReviews = 0;
  let autoResolvedReviews = 0;
  let pendingOutcomeReviews = 0;

  for (const review of reviews) {
    const effective = resolveEffectiveReviewOutcome(review);
    const marketOutcome = toTrainingOutcome(effective.outcome);

    if (marketOutcome) {
      resolvedReviews += 1;
      if (effective.source === 'MANUAL') {
        manualResolvedReviews += 1;
      } else if (effective.source === 'AUTO') {
        autoResolvedReviews += 1;
      }

      const weight = effective.source === 'MANUAL' ? 2 : 1;
      for (let index = 0; index < weight; index += 1) {
        examples.push({
          snapshotId: `market-${review.alertId}-${index}`,
          candidate: cloneCandidate(review.alertSnapshot.candidate),
          outcome: marketOutcome
        });
        marketExamples += 1;
        if (effective.source === 'MANUAL') {
          manualOutcomeExamples += 1;
        } else {
          autoOutcomeExamples += 1;
        }
      }
    } else {
      pendingOutcomeReviews += 1;
    }

    if (review.validity === 'VALID' || review.validity === 'INVALID') {
      examples.push({
        snapshotId: `preference-${review.alertId}`,
        candidate: cloneCandidate(review.alertSnapshot.candidate),
        outcome: review.validity === 'VALID' ? 'WIN' : 'LOSS'
      });
      preferenceExamples += 1;
      manualPreferenceExamples += 1;
    }
  }

  return {
    examples,
    counts: {
      totalExamples: examples.length,
      marketExamples,
      preferenceExamples,
      manualOutcomeExamples,
      autoOutcomeExamples,
      manualPreferenceExamples,
      resolvedReviews,
      manualResolvedReviews,
      autoResolvedReviews,
      pendingOutcomeReviews
    }
  };
};

export const summarizeLearningPerformance = (reviews: SignalReviewEntry[]): LearningPerformanceSummary => {
  const bySetup = new Map<string, { wins: number; losses: number }>();
  const byTimeBucket = new Map<string, { wins: number; losses: number }>();
  const byScoreBucket = new Map<string, { wins: number; losses: number }>();
  const byDetectionTimeframe = new Map<string, { wins: number; losses: number }>();
  const byExecutionTimeframe = new Map<string, { wins: number; losses: number }>();
  const byResearchAlignment = new Map<string, { wins: number; losses: number }>();
  const setupPreference = new Map<SetupType, number>();
  const symbolPreference = new Map<SymbolCode, number>();

  let resolvedReviews = 0;
  let manualResolvedReviews = 0;
  let autoResolvedReviews = 0;
  let pendingOutcomeReviews = 0;
  let wins = 0;
  let losses = 0;
  let readyResolved = 0;
  let readyWins = 0;
  let blockedResolved = 0;
  let blockedWins = 0;
  let validVotes = 0;
  let invalidVotes = 0;

  for (const review of reviews) {
    const effective = resolveEffectiveReviewOutcome(review);
    const outcome = toTrainingOutcome(effective.outcome);

    if (!outcome) {
      pendingOutcomeReviews += 1;
    } else {
      const isWin = outcome === 'WIN';
      resolvedReviews += 1;
      wins += isWin ? 1 : 0;
      losses += isWin ? 0 : 1;

      if (effective.source === 'MANUAL') {
        manualResolvedReviews += 1;
      } else if (effective.source === 'AUTO') {
        autoResolvedReviews += 1;
      }

      const score = Number(
        review.alertSnapshot?.candidate?.finalScore ?? review.alertSnapshot?.candidate?.baseScore ?? 0
      );
      pushBucket(bySetup, review.setupType, isWin);
      pushBucket(byTimeBucket, labelForTimeBucket(review.detectedAt), isWin);
      pushBucket(byScoreBucket, labelForScoreBucket(score), isWin);
      pushBucket(
        byDetectionTimeframe,
        normalizeAlertTimeframe(review.alertSnapshot?.candidate?.detectionTimeframe),
        isWin
      );
      pushBucket(
        byExecutionTimeframe,
        review.alertSnapshot?.candidate?.executionTimeframe ?? '5m',
        isWin
      );
      pushBucket(
        byResearchAlignment,
        review.alertSnapshot?.candidate?.metadata?.researchTrendAligned === true
          ? 'Aligned'
          : review.alertSnapshot?.candidate?.metadata?.researchTrendAligned === false
            ? 'Opposed'
            : 'Neutral',
        isWin
      );

      if (review.alertSnapshot?.riskDecision?.allowed) {
        readyResolved += 1;
        readyWins += isWin ? 1 : 0;
      } else {
        blockedResolved += 1;
        blockedWins += isWin ? 1 : 0;
      }
    }

    if (review.validity === 'VALID') {
      validVotes += 1;
      setupPreference.set(review.setupType, (setupPreference.get(review.setupType) ?? 0) + 1);
      symbolPreference.set(review.symbol, (symbolPreference.get(review.symbol) ?? 0) + 1);
    } else if (review.validity === 'INVALID') {
      invalidVotes += 1;
      setupPreference.set(review.setupType, (setupPreference.get(review.setupType) ?? 0) - 1);
      symbolPreference.set(review.symbol, (symbolPreference.get(review.symbol) ?? 0) - 1);
    }
  }

  const preferredSetups = [...setupPreference.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([setup]) => setup);
  const preferredSymbols = [...symbolPreference.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([symbol]) => symbol);

  return {
    resolvedReviews,
    pendingOutcomeReviews,
    manualResolvedReviews,
    autoResolvedReviews,
    winRate: resolvedReviews > 0 ? wins / resolvedReviews : 0,
    bySetup: summarizeBuckets(bySetup),
    byTimeBucket: summarizeBuckets(byTimeBucket),
    byScoreBucket: summarizeBuckets(byScoreBucket, (key) => `Score ${key}`),
    byDetectionTimeframe: summarizeBuckets(byDetectionTimeframe),
    byExecutionTimeframe: summarizeBuckets(byExecutionTimeframe),
    byResearchAlignment: summarizeBuckets(byResearchAlignment),
    blockedVsReady: {
      readyResolved,
      blockedResolved,
      readyWinRate: readyResolved > 0 ? readyWins / readyResolved : 0,
      blockedWinRate: blockedResolved > 0 ? blockedWins / blockedResolved : 0
    },
    preference: {
      validVotes,
      invalidVotes,
      preferredSetups,
      preferredSymbols
    }
  };
};

const toReviewLikeFromTradeRecord = (record: TradeLearningRecord): SignalReviewEntry | null => {
  if (!record.alertSnapshot) {
    return null;
  }

  return {
    reviewId: record.review.reviewId ?? record.recordId,
    alertId: record.alertId,
    candidateId: record.candidateId,
    symbol: record.symbol,
    setupType: record.setupType,
    side: record.side,
    detectedAt: record.detectedAt,
    reviewStatus: record.review.reviewStatus,
    validity: record.review.validity,
    outcome: record.review.outcome,
    notes: record.review.notes,
    reviewedBy: record.review.reviewedBy,
    reviewedAt: record.review.reviewedAt,
    autoOutcome: record.review.autoOutcome,
    autoLabeledAt: record.review.autoLabeledAt,
    autoLabeledBy: record.review.autoLabeledBy,
    effectiveOutcome: record.review.effectiveOutcome,
    effectiveOutcomeSource: record.review.effectiveOutcomeSource,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    acknowledgedAt: undefined,
    acknowledgedBy: undefined,
    escalationCount: 0,
    lastEscalatedAt: undefined,
    alertSnapshot: record.alertSnapshot
  };
};

export const buildLearningFeedbackDatasetFromTradeRecords = (
  records: TradeLearningRecord[]
): LearningFeedbackDataset =>
  buildLearningFeedbackDataset(
    records
      .map((record) => toReviewLikeFromTradeRecord(record))
      .filter((record): record is SignalReviewEntry => record !== null)
  );

export const summarizeLearningPerformanceFromTradeRecords = (
  records: TradeLearningRecord[]
): LearningPerformanceSummary =>
  summarizeLearningPerformance(
    records
      .map((record) => toReviewLikeFromTradeRecord(record))
      .filter((record): record is SignalReviewEntry => record !== null)
  );
