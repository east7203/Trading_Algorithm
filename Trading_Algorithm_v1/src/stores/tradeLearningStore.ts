import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  SetupType,
  SignalAlert,
  SignalReviewEntry,
  SignalReviewOutcome,
  SignalReviewOutcomeSource,
  SignalReviewStatus,
  SignalReviewValidity,
  Side,
  SymbolCode
} from '../domain/types.js';
import type { PaperTrade } from '../services/paperTradingService.js';

interface PersistedTradeLearningState {
  records: TradeLearningRecord[];
}

export interface TradeLearningReviewSnapshot {
  reviewId?: string;
  reviewStatus: SignalReviewStatus;
  validity?: SignalReviewValidity;
  outcome?: SignalReviewOutcome;
  effectiveOutcome?: SignalReviewOutcome;
  effectiveOutcomeSource: SignalReviewOutcomeSource;
  autoOutcome?: SignalReviewOutcome;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  autoLabeledAt?: string;
  autoLabeledBy?: string;
}

export interface TradeLearningPaperSnapshot {
  paperTradeId: string;
  status: PaperTrade['status'];
  source: string;
  submittedAt: string;
  expiresAt: string;
  filledAt?: string;
  filledPrice?: number;
  closedAt?: string;
  exitPrice?: number;
  exitReason?: PaperTrade['exitReason'];
  realizedPnl?: number;
  realizedR?: number;
  quantity: number;
  riskPct: number;
  riskAmount: number;
}

export interface TradeLearningResearchSnapshot {
  direction?: string;
  confidence?: number;
  aligned?: boolean;
  leadSymbol?: string;
  summary?: string;
}

export interface TradeLearningAutonomySnapshot {
  thesis?: string;
  reason?: string;
}

export interface TradeLearningReasoningSnapshot {
  alertSummary?: string;
  reviewNotes?: string;
  passReasons: string[];
  failReasons: string[];
  guardrailCodes: string[];
  why: string[];
}

export interface TradeLearningRecord {
  recordId: string;
  alertId: string;
  candidateId: string;
  symbol: SymbolCode;
  setupType: SetupType;
  side: Side;
  source: string;
  detectedAt: string;
  createdAt: string;
  updatedAt: string;
  alertSnapshot?: SignalAlert;
  review: TradeLearningReviewSnapshot;
  paperTrade?: TradeLearningPaperSnapshot;
  research: TradeLearningResearchSnapshot;
  autonomy: TradeLearningAutonomySnapshot;
  reasoning: TradeLearningReasoningSnapshot;
}

export interface TradeLearningSummaryBucket {
  key: string;
  label: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface TradeLearningSummary {
  totalRecords: number;
  pendingRecords: number;
  resolvedRecords: number;
  wins: number;
  losses: number;
  breakeven: number;
  missed: number;
  skipped: number;
  manualResolved: number;
  autoResolved: number;
  withPaperTrades: number;
  paperClosedTrades: number;
  withResearchSummary: number;
  withReviewNotes: number;
  bySetup: TradeLearningSummaryBucket[];
  byAutonomyThesis: TradeLearningSummaryBucket[];
  byResearchDirection: TradeLearningSummaryBucket[];
}

const isSymbolCode = (value: unknown): value is SymbolCode =>
  value === 'NAS100' || value === 'US30' || value === 'NQ' || value === 'ES' || value === 'YM' || value === 'MNQ' || value === 'MYM';

const isSetupType = (value: unknown): value is SetupType =>
  value === 'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION'
  || value === 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES'
  || value === 'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION'
  || value === 'NY_BREAK_RETEST_MOMENTUM'
  || value === 'WERLEIN_FOREVER_MODEL'
  || value === 'AUTONOMOUS_FUTURES_DAYTRADER';

const isSide = (value: unknown): value is Side => value === 'LONG' || value === 'SHORT';

const isReviewStatus = (value: unknown): value is SignalReviewStatus => value === 'PENDING' || value === 'COMPLETED';

const isReviewValidity = (value: unknown): value is SignalReviewValidity =>
  value === 'VALID' || value === 'INVALID' || value === 'UNSURE';

const isReviewOutcome = (value: unknown): value is SignalReviewOutcome =>
  value === 'WOULD_WIN' || value === 'WOULD_LOSE' || value === 'MISSED' || value === 'SKIPPED' || value === 'BREAKEVEN';

const isOutcomeSource = (value: unknown): value is SignalReviewOutcomeSource =>
  value === 'MANUAL' || value === 'AUTO' || value === 'NONE';

const normalizeOptionalText = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeOptionalNumber = (value: unknown, digits = 2): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Number(value.toFixed(digits));
};

const normalizeStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim())
    : [];

const summarizeWhy = (
  alertSummary: string | undefined,
  passReasons: string[],
  failReasons: string[],
  guardrailCodes: string[],
  reviewNotes: string | undefined,
  autonomyReason: string | undefined,
  researchSummary: string | undefined
): string[] => {
  const parts = [
    alertSummary,
    ...passReasons.slice(0, 3),
    ...failReasons.slice(0, 2),
    ...guardrailCodes.slice(0, 3),
    autonomyReason,
    researchSummary,
    reviewNotes
  ]
    .map((value) => normalizeOptionalText(value))
    .filter((value): value is string => Boolean(value));

  return [...new Set(parts)].slice(0, 8);
};

const buildResearchSnapshot = (
  alert: SignalAlert | undefined,
  existing?: TradeLearningResearchSnapshot,
  trade?: PaperTrade
): TradeLearningResearchSnapshot => {
  const metadata = alert?.candidate?.metadata ?? {};
  const direction = normalizeOptionalText(
    (metadata as Record<string, unknown>).researchTrendDirection
    ?? (metadata as Record<string, unknown>).researchDirection
    ?? trade?.researchDirection
    ?? existing?.direction
  );
  const confidence = normalizeOptionalNumber(
    (metadata as Record<string, unknown>).researchTrendConfidence
    ?? (metadata as Record<string, unknown>).researchConfidence
    ?? existing?.confidence,
    2
  );
  const leadSymbol = normalizeOptionalText((metadata as Record<string, unknown>).researchTrendLeadSymbol ?? existing?.leadSymbol);
  const summary = normalizeOptionalText(
    (metadata as Record<string, unknown>).researchTrendSummary
    ?? alert?.summary
    ?? existing?.summary
  );
  const alignedValue = (metadata as Record<string, unknown>).researchTrendAligned;
  const aligned = typeof alignedValue === 'boolean' ? alignedValue : existing?.aligned;

  return {
    direction,
    confidence,
    aligned,
    leadSymbol,
    summary
  };
};

const buildAutonomySnapshot = (
  alert: SignalAlert | undefined,
  existing?: TradeLearningAutonomySnapshot,
  trade?: PaperTrade
): TradeLearningAutonomySnapshot => {
  const metadata = alert?.candidate?.metadata ?? {};
  return {
    thesis: normalizeOptionalText((metadata as Record<string, unknown>).autonomyThesis ?? trade?.autonomyThesis ?? existing?.thesis),
    reason: normalizeOptionalText((metadata as Record<string, unknown>).autonomyReason ?? trade?.autonomyReason ?? existing?.reason)
  };
};

const buildReasoningSnapshot = (
  alert: SignalAlert | undefined,
  review: TradeLearningReviewSnapshot,
  research: TradeLearningResearchSnapshot,
  autonomy: TradeLearningAutonomySnapshot,
  existing?: TradeLearningReasoningSnapshot
): TradeLearningReasoningSnapshot => {
  const passReasons = alert?.candidate?.eligibility?.passReasons ?? existing?.passReasons ?? [];
  const failReasons = alert?.candidate?.eligibility?.failReasons ?? existing?.failReasons ?? [];
  const guardrailCodes = alert?.riskDecision?.reasonCodes ?? existing?.guardrailCodes ?? [];
  const alertSummary = normalizeOptionalText(alert?.summary ?? existing?.alertSummary);
  const reviewNotes = normalizeOptionalText(review.notes ?? existing?.reviewNotes);

  return {
    alertSummary,
    reviewNotes,
    passReasons: [...passReasons],
    failReasons: [...failReasons],
    guardrailCodes: [...guardrailCodes],
    why: summarizeWhy(alertSummary, passReasons, failReasons, guardrailCodes, reviewNotes, autonomy.reason, research.summary)
  };
};

const normalizePaperSnapshot = (trade: PaperTrade): TradeLearningPaperSnapshot => ({
  paperTradeId: trade.paperTradeId,
  status: trade.status,
  source: trade.source,
  submittedAt: trade.submittedAt,
  expiresAt: trade.expiresAt,
  filledAt: trade.filledAt,
  filledPrice: normalizeOptionalNumber(trade.filledPrice, 4),
  closedAt: trade.closedAt,
  exitPrice: normalizeOptionalNumber(trade.exitPrice, 4),
  exitReason: trade.exitReason,
  realizedPnl: normalizeOptionalNumber(trade.realizedPnl, 2),
  realizedR: normalizeOptionalNumber(trade.realizedR, 2),
  quantity: Number(trade.quantity.toFixed(4)),
  riskPct: Number(trade.riskPct.toFixed(4)),
  riskAmount: Number(trade.riskAmount.toFixed(4))
});

const normalizeRecord = (value: unknown): TradeLearningRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<TradeLearningRecord>;
  if (
    typeof candidate.recordId !== 'string'
    || typeof candidate.alertId !== 'string'
    || typeof candidate.candidateId !== 'string'
    || !isSymbolCode(candidate.symbol)
    || !isSetupType(candidate.setupType)
    || !isSide(candidate.side)
    || typeof candidate.source !== 'string'
    || typeof candidate.detectedAt !== 'string'
    || typeof candidate.createdAt !== 'string'
    || typeof candidate.updatedAt !== 'string'
    || !candidate.review
    || typeof candidate.review !== 'object'
  ) {
    return null;
  }

  const reviewCandidate = candidate.review as Partial<TradeLearningReviewSnapshot>;
  if (!isReviewStatus(reviewCandidate.reviewStatus) || !isOutcomeSource(reviewCandidate.effectiveOutcomeSource)) {
    return null;
  }

  return {
    recordId: candidate.recordId,
    alertId: candidate.alertId,
    candidateId: candidate.candidateId,
    symbol: candidate.symbol,
    setupType: candidate.setupType,
    side: candidate.side,
    source: candidate.source,
    detectedAt: candidate.detectedAt,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    alertSnapshot: candidate.alertSnapshot,
    review: {
      reviewId: normalizeOptionalText(reviewCandidate.reviewId),
      reviewStatus: reviewCandidate.reviewStatus,
      validity: isReviewValidity(reviewCandidate.validity) ? reviewCandidate.validity : undefined,
      outcome: isReviewOutcome(reviewCandidate.outcome) ? reviewCandidate.outcome : undefined,
      effectiveOutcome: isReviewOutcome(reviewCandidate.effectiveOutcome) ? reviewCandidate.effectiveOutcome : undefined,
      effectiveOutcomeSource: reviewCandidate.effectiveOutcomeSource,
      autoOutcome: isReviewOutcome(reviewCandidate.autoOutcome) ? reviewCandidate.autoOutcome : undefined,
      notes: normalizeOptionalText(reviewCandidate.notes),
      reviewedBy: normalizeOptionalText(reviewCandidate.reviewedBy),
      reviewedAt: normalizeOptionalText(reviewCandidate.reviewedAt),
      autoLabeledAt: normalizeOptionalText(reviewCandidate.autoLabeledAt),
      autoLabeledBy: normalizeOptionalText(reviewCandidate.autoLabeledBy)
    },
    paperTrade: candidate.paperTrade && typeof candidate.paperTrade === 'object'
      ? {
          paperTradeId: String((candidate.paperTrade as TradeLearningPaperSnapshot).paperTradeId),
          status: String((candidate.paperTrade as TradeLearningPaperSnapshot).status) as PaperTrade['status'],
          source: String((candidate.paperTrade as TradeLearningPaperSnapshot).source),
          submittedAt: String((candidate.paperTrade as TradeLearningPaperSnapshot).submittedAt),
          expiresAt: String((candidate.paperTrade as TradeLearningPaperSnapshot).expiresAt),
          filledAt: normalizeOptionalText((candidate.paperTrade as TradeLearningPaperSnapshot).filledAt),
          filledPrice: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).filledPrice, 4),
          closedAt: normalizeOptionalText((candidate.paperTrade as TradeLearningPaperSnapshot).closedAt),
          exitPrice: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).exitPrice, 4),
          exitReason: normalizeOptionalText((candidate.paperTrade as TradeLearningPaperSnapshot).exitReason) as PaperTrade['exitReason'] | undefined,
          realizedPnl: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).realizedPnl, 2),
          realizedR: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).realizedR, 2),
          quantity: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).quantity, 4) ?? 0,
          riskPct: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).riskPct, 4) ?? 0,
          riskAmount: normalizeOptionalNumber((candidate.paperTrade as TradeLearningPaperSnapshot).riskAmount, 4) ?? 0
        }
      : undefined,
    research: {
      direction: normalizeOptionalText(candidate.research?.direction),
      confidence: normalizeOptionalNumber(candidate.research?.confidence, 2),
      aligned: typeof candidate.research?.aligned === 'boolean' ? candidate.research.aligned : undefined,
      leadSymbol: normalizeOptionalText(candidate.research?.leadSymbol),
      summary: normalizeOptionalText(candidate.research?.summary)
    },
    autonomy: {
      thesis: normalizeOptionalText(candidate.autonomy?.thesis),
      reason: normalizeOptionalText(candidate.autonomy?.reason)
    },
    reasoning: {
      alertSummary: normalizeOptionalText(candidate.reasoning?.alertSummary),
      reviewNotes: normalizeOptionalText(candidate.reasoning?.reviewNotes),
      passReasons: normalizeStringArray(candidate.reasoning?.passReasons),
      failReasons: normalizeStringArray(candidate.reasoning?.failReasons),
      guardrailCodes: normalizeStringArray(candidate.reasoning?.guardrailCodes),
      why: normalizeStringArray(candidate.reasoning?.why)
    }
  };
};

const sortRecords = (records: TradeLearningRecord[]): TradeLearningRecord[] =>
  records.sort((left, right) => right.detectedAt.localeCompare(left.detectedAt));

const pushSummaryBucket = (
  map: Map<string, { total: number; wins: number; losses: number }>,
  key: string,
  outcome: SignalReviewOutcome | undefined
): void => {
  const current = map.get(key) ?? { total: 0, wins: 0, losses: 0 };
  map.set(key, {
    total: current.total + 1,
    wins: current.wins + (outcome === 'WOULD_WIN' ? 1 : 0),
    losses: current.losses + (outcome === 'WOULD_LOSE' ? 1 : 0)
  });
};

const finalizeSummaryBuckets = (
  map: Map<string, { total: number; wins: number; losses: number }>
): TradeLearningSummaryBucket[] =>
  [...map.entries()]
    .map(([key, counts]) => ({
      key,
      label: key,
      total: counts.total,
      wins: counts.wins,
      losses: counts.losses,
      winRate: counts.total > 0 ? counts.wins / counts.total : 0
    }))
    .sort((left, right) => right.total - left.total || right.winRate - left.winRate || left.label.localeCompare(right.label));

const extractPersistedRecordObjects = (raw: string): string[] => {
  const recordsKeyIndex = raw.indexOf('"records"');
  if (recordsKeyIndex < 0) {
    return [];
  }

  const arrayStartIndex = raw.indexOf('[', recordsKeyIndex);
  if (arrayStartIndex < 0) {
    return [];
  }

  const objects: string[] = [];
  let objectStartIndex = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStartIndex + 1; index < raw.length; index += 1) {
    const character = raw[index];

    if (objectStartIndex < 0) {
      if (character === '{') {
        objectStartIndex = index;
        depth = 1;
      } else if (character === ']') {
        break;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{' || character === '[') {
      depth += 1;
      continue;
    }

    if (character === '}' || character === ']') {
      depth -= 1;
      if (depth === 0) {
        objects.push(raw.slice(objectStartIndex, index + 1));
        objectStartIndex = -1;
      }
    }
  }

  return objects;
};

const recoverRecordsFromCorruptState = (raw: string): TradeLearningRecord[] => {
  const recovered: TradeLearningRecord[] = [];

  for (const objectText of extractPersistedRecordObjects(raw)) {
    try {
      const parsed = JSON.parse(objectText);
      const normalized = normalizeRecord(parsed);
      if (normalized) {
        recovered.push(normalized);
      }
    } catch {
      // Skip malformed trailing fragments and keep any complete records we can recover.
    }
  }

  return recovered;
};

export class TradeLearningStore {
  private started = false;
  private startPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private records = new Map<string, TradeLearningRecord>();

  constructor(private readonly filePath: string) {}

  private async backupCorruptFile(raw: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.filePath}.corrupt-${timestamp}`;
    await fs.mkdir(path.dirname(backupPath), { recursive: true });
    await fs.writeFile(backupPath, raw, 'utf8');
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    if (!this.startPromise) {
      this.startPromise = this.load();
    }

    await this.startPromise;
    this.started = true;
  }

  async recordAlert(alert: SignalAlert, source: string): Promise<TradeLearningRecord> {
    await this.start();

    const existing = this.records.get(alert.alertId);
    if (existing && existing.updatedAt > alert.detectedAt) {
      return structuredClone(existing);
    }
    const research = buildResearchSnapshot(alert, existing?.research);
    const autonomy = buildAutonomySnapshot(alert, existing?.autonomy);
    const review: TradeLearningReviewSnapshot = existing?.review ?? {
      reviewStatus: 'PENDING',
      effectiveOutcomeSource: 'NONE'
    };
    const reasoning = buildReasoningSnapshot(alert, review, research, autonomy, existing?.reasoning);
    const now = alert.detectedAt;

    const next: TradeLearningRecord = {
      recordId: existing?.recordId ?? uuidv4(),
      alertId: alert.alertId,
      candidateId: alert.candidate.id,
      symbol: alert.symbol,
      setupType: alert.setupType,
      side: alert.side,
      source,
      detectedAt: alert.detectedAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      alertSnapshot: structuredClone(alert),
      review,
      paperTrade: existing?.paperTrade,
      research,
      autonomy,
      reasoning
    };

    this.records.set(alert.alertId, next);
    await this.persist();
    return structuredClone(next);
  }

  async syncReview(review: SignalReviewEntry): Promise<TradeLearningRecord> {
    await this.start();

    const existing = this.records.get(review.alertId);
    if (existing && existing.updatedAt > review.updatedAt) {
      return structuredClone(existing);
    }
    const alert = review.alertSnapshot;
    const research = buildResearchSnapshot(alert, existing?.research);
    const autonomy = buildAutonomySnapshot(alert, existing?.autonomy);
    const reviewSnapshot: TradeLearningReviewSnapshot = {
      reviewId: review.reviewId,
      reviewStatus: review.reviewStatus,
      validity: review.validity,
      outcome: review.outcome,
      effectiveOutcome: review.effectiveOutcome,
      effectiveOutcomeSource: review.effectiveOutcomeSource ?? 'NONE',
      autoOutcome: review.autoOutcome,
      notes: normalizeOptionalText(review.notes),
      reviewedBy: normalizeOptionalText(review.reviewedBy),
      reviewedAt: normalizeOptionalText(review.reviewedAt),
      autoLabeledAt: normalizeOptionalText(review.autoLabeledAt),
      autoLabeledBy: normalizeOptionalText(review.autoLabeledBy)
    };
    const reasoning = buildReasoningSnapshot(alert, reviewSnapshot, research, autonomy, existing?.reasoning);

    const next: TradeLearningRecord = {
      recordId: existing?.recordId ?? uuidv4(),
      alertId: review.alertId,
      candidateId: review.candidateId,
      symbol: review.symbol,
      setupType: review.setupType,
      side: review.side,
      source: existing?.source ?? 'signal-review',
      detectedAt: review.detectedAt,
      createdAt: existing?.createdAt ?? review.createdAt,
      updatedAt: review.updatedAt,
      alertSnapshot: structuredClone(alert),
      review: reviewSnapshot,
      paperTrade: existing?.paperTrade,
      research,
      autonomy,
      reasoning
    };

    this.records.set(review.alertId, next);
    await this.persist();
    return structuredClone(next);
  }

  async syncPaperTrade(trade: PaperTrade, syncedAt = new Date().toISOString()): Promise<TradeLearningRecord> {
    await this.start();

    const existing = this.records.get(trade.alertId);
    if (existing && existing.updatedAt > syncedAt) {
      return structuredClone(existing);
    }
    const alert = existing?.alertSnapshot;
    const research = buildResearchSnapshot(alert, existing?.research, trade);
    const autonomy = buildAutonomySnapshot(alert, existing?.autonomy, trade);
    const review = existing?.review ?? {
      reviewStatus: 'PENDING',
      effectiveOutcomeSource: 'NONE' as const
    };
    const reasoning = buildReasoningSnapshot(alert, review, research, autonomy, existing?.reasoning);

    const next: TradeLearningRecord = {
      recordId: existing?.recordId ?? uuidv4(),
      alertId: trade.alertId,
      candidateId: trade.candidateId,
      symbol: trade.symbol,
      setupType: trade.setupType,
      side: trade.side,
      source: existing?.source ?? trade.source,
      detectedAt: existing?.detectedAt ?? trade.submittedAt,
      createdAt: existing?.createdAt ?? trade.submittedAt,
      updatedAt: syncedAt,
      alertSnapshot: existing?.alertSnapshot,
      review,
      paperTrade: normalizePaperSnapshot(trade),
      research,
      autonomy,
      reasoning
    };

    this.records.set(trade.alertId, next);
    await this.persist();
    return structuredClone(next);
  }

  async getRecord(alertId: string): Promise<TradeLearningRecord | undefined> {
    await this.start();
    const record = this.records.get(alertId);
    return record ? structuredClone(record) : undefined;
  }

  async listRecords(status: 'ALL' | 'PENDING' | 'RESOLVED' = 'ALL', limit = 100): Promise<TradeLearningRecord[]> {
    await this.start();

    const resolved = (record: TradeLearningRecord) =>
      Boolean(record.review.effectiveOutcome || record.review.validity || record.paperTrade?.closedAt);
    const records = sortRecords([...this.records.values()]).filter((record) => {
      if (status === 'ALL') {
        return true;
      }
      return status === 'RESOLVED' ? resolved(record) : !resolved(record);
    });

    return records.slice(0, Math.max(1, limit)).map((record) => structuredClone(record));
  }

  async listAllRecords(): Promise<TradeLearningRecord[]> {
    await this.start();
    return sortRecords([...this.records.values()]).map((record) => structuredClone(record));
  }

  async summary(): Promise<TradeLearningSummary> {
    await this.start();

    let pendingRecords = 0;
    let resolvedRecords = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let missed = 0;
    let skipped = 0;
    let manualResolved = 0;
    let autoResolved = 0;
    let withPaperTrades = 0;
    let paperClosedTrades = 0;
    let withResearchSummary = 0;
    let withReviewNotes = 0;
    const bySetup = new Map<string, { total: number; wins: number; losses: number }>();
    const byAutonomyThesis = new Map<string, { total: number; wins: number; losses: number }>();
    const byResearchDirection = new Map<string, { total: number; wins: number; losses: number }>();

    for (const record of this.records.values()) {
      const outcome = record.review.effectiveOutcome;
      if (outcome) {
        resolvedRecords += 1;
      } else {
        pendingRecords += 1;
      }

      if (record.review.effectiveOutcomeSource === 'MANUAL' && outcome) {
        manualResolved += 1;
      } else if (record.review.effectiveOutcomeSource === 'AUTO' && outcome) {
        autoResolved += 1;
      }

      wins += outcome === 'WOULD_WIN' ? 1 : 0;
      losses += outcome === 'WOULD_LOSE' ? 1 : 0;
      breakeven += outcome === 'BREAKEVEN' ? 1 : 0;
      missed += outcome === 'MISSED' ? 1 : 0;
      skipped += outcome === 'SKIPPED' ? 1 : 0;
      withPaperTrades += record.paperTrade ? 1 : 0;
      paperClosedTrades += record.paperTrade?.closedAt ? 1 : 0;
      withResearchSummary += record.research.summary ? 1 : 0;
      withReviewNotes += record.reasoning.reviewNotes ? 1 : 0;

      pushSummaryBucket(bySetup, record.setupType, outcome);
      if (record.autonomy.thesis) {
        pushSummaryBucket(byAutonomyThesis, record.autonomy.thesis, outcome);
      }
      if (record.research.direction) {
        pushSummaryBucket(byResearchDirection, record.research.direction, outcome);
      }
    }

    return {
      totalRecords: this.records.size,
      pendingRecords,
      resolvedRecords,
      wins,
      losses,
      breakeven,
      missed,
      skipped,
      manualResolved,
      autoResolved,
      withPaperTrades,
      paperClosedTrades,
      withResearchSummary,
      withReviewNotes,
      bySetup: finalizeSummaryBuckets(bySetup),
      byAutonomyThesis: finalizeSummaryBuckets(byAutonomyThesis),
      byResearchDirection: finalizeSummaryBuckets(byResearchDirection)
    };
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        this.records.clear();
        return;
      }
      const parsed = JSON.parse(trimmed) as Partial<PersistedTradeLearningState>;
      this.records = new Map(
        (Array.isArray(parsed.records) ? parsed.records : [])
          .map((record) => normalizeRecord(record))
          .filter((record): record is TradeLearningRecord => record !== null)
          .map((record) => [record.alertId, record])
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        this.records.clear();
        return;
      }

      if (error instanceof SyntaxError) {
        const raw = await fs.readFile(this.filePath, 'utf8');
        const recoveredRecords = recoverRecordsFromCorruptState(raw);
        await this.backupCorruptFile(raw);
        this.records = new Map(recoveredRecords.map((record) => [record.alertId, record]));
        await this.persist();
        console.warn(
          `Recovered ${recoveredRecords.length} trade learning records from corrupt state at ${this.filePath}`
        );
        return;
      }

      throw error;
    }
  }

  private async persist(): Promise<void> {
    const snapshot: PersistedTradeLearningState = {
      records: sortRecords([...this.records.values()]).map((record) => structuredClone(record))
    };

    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    });

    await this.writeChain;
  }
}
