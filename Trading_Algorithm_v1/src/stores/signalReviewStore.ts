import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  SignalAlert,
  SignalAlertReviewState,
  SignalReviewEntry,
  SignalReviewOutcome,
  SignalReviewOutcomeSource,
  SignalReviewStatus,
  SignalReviewValidity
} from '../domain/types.js';

interface PersistedSignalReviewState {
  reviews: SignalReviewEntry[];
}

export interface SignalReviewSummary {
  pending: number;
  completed: number;
  total: number;
  manualResolved: number;
  autoResolved: number;
  pendingOutcome: number;
}

export interface SignalReviewUpdate {
  alertId: string;
  validity?: SignalReviewValidity;
  outcome?: SignalReviewOutcome;
  notes?: string;
  reviewedBy?: string;
  reviewStatus?: SignalReviewStatus;
  reviewedAt?: string;
}

const buildReviewState = (review: SignalReviewEntry): SignalAlertReviewState => ({
  reviewStatus: review.reviewStatus,
  acknowledgedAt: review.acknowledgedAt,
  acknowledgedBy: review.acknowledgedBy,
  escalationCount: review.escalationCount ?? 0,
  lastEscalatedAt: review.lastEscalatedAt,
  reviewedAt: review.reviewedAt,
  validity: review.validity,
  outcome: review.outcome,
  autoOutcome: review.autoOutcome,
  autoLabeledAt: review.autoLabeledAt,
  autoLabeledBy: review.autoLabeledBy,
  effectiveOutcome: review.effectiveOutcome,
  effectiveOutcomeSource: review.effectiveOutcomeSource
});

const resolveEffectiveOutcome = (
  entry: SignalReviewEntry
): { outcome?: SignalReviewOutcome; source: SignalReviewOutcomeSource } => {
  if (entry.outcome) {
    return {
      outcome: entry.outcome,
      source: 'MANUAL'
    };
  }

  if (entry.autoOutcome) {
    return {
      outcome: entry.autoOutcome,
      source: 'AUTO'
    };
  }

  return {
    outcome: undefined,
    source: 'NONE'
  };
};

const normalizeResolvedReviewState = (entry: SignalReviewEntry): SignalReviewEntry => {
  if (entry.reviewStatus === 'COMPLETED') {
    return entry;
  }

  if (entry.outcome) {
    return {
      ...entry,
      reviewStatus: 'COMPLETED',
      reviewedAt: entry.reviewedAt ?? entry.updatedAt,
      reviewedBy: entry.reviewedBy ?? entry.acknowledgedBy
    };
  }

  if (entry.autoOutcome) {
    return {
      ...entry,
      reviewStatus: 'COMPLETED',
      reviewedAt: entry.reviewedAt ?? entry.autoLabeledAt ?? entry.updatedAt,
      reviewedBy: entry.reviewedBy ?? entry.autoLabeledBy ?? 'system-auto-reviewer'
    };
  }

  return entry;
};

const syncAlertSnapshotState = (entry: SignalReviewEntry): SignalReviewEntry => {
  const normalizedEntry = normalizeResolvedReviewState(entry);
  const effective = resolveEffectiveOutcome(normalizedEntry);
  const next: SignalReviewEntry = {
    ...normalizedEntry,
    effectiveOutcome: effective.outcome,
    effectiveOutcomeSource: effective.source
  };

  return {
    ...next,
    alertSnapshot: {
      ...next.alertSnapshot,
      reviewState: buildReviewState(next)
    }
  };
};

const sortReviews = (reviews: SignalReviewEntry[]): SignalReviewEntry[] =>
  reviews.sort((a, b) => {
    if (a.reviewStatus !== b.reviewStatus) {
      return a.reviewStatus === 'PENDING' ? -1 : 1;
    }
    return b.detectedAt.localeCompare(a.detectedAt);
  });

const normalizeOptionalText = (value?: string): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const inferReviewStatus = (
  explicitStatus: SignalReviewStatus | undefined,
  validity: SignalReviewValidity | undefined,
  outcome: SignalReviewOutcome | undefined,
  notes: string | undefined,
  reviewedBy: string | undefined
): SignalReviewStatus => {
  if (explicitStatus) {
    return explicitStatus;
  }

  return validity || outcome || notes || reviewedBy ? 'COMPLETED' : 'PENDING';
};

export class SignalReviewStore {
  private started = false;
  private startPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private reviews = new Map<string, SignalReviewEntry>();

  constructor(private readonly filePath: string) {}

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

  async recordAlert(alert: SignalAlert): Promise<SignalReviewEntry> {
    await this.start();

    const existing = this.reviews.get(alert.alertId);
    const timestamp = alert.detectedAt;
    const entry: SignalReviewEntry = existing
      ? syncAlertSnapshotState({
          ...existing,
          candidateId: alert.candidate.id,
          symbol: alert.symbol,
          setupType: alert.setupType,
          side: alert.side,
          detectedAt: alert.detectedAt,
          updatedAt: timestamp,
          alertSnapshot: alert
        })
      : syncAlertSnapshotState({
          reviewId: uuidv4(),
          alertId: alert.alertId,
          candidateId: alert.candidate.id,
          symbol: alert.symbol,
          setupType: alert.setupType,
          side: alert.side,
          detectedAt: alert.detectedAt,
          reviewStatus: 'PENDING',
          escalationCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
          alertSnapshot: alert
        });

    this.reviews.set(alert.alertId, entry);
    await this.persist();
    return entry;
  }

  async upsertReview(update: SignalReviewUpdate): Promise<SignalReviewEntry> {
    await this.start();

    const existing = this.reviews.get(update.alertId);
    if (!existing) {
      throw new Error(`Signal review not found for alert ${update.alertId}`);
    }

    const validity = update.validity ?? existing.validity;
    const outcome = update.outcome ?? existing.outcome;
    const notes = update.notes === undefined ? existing.notes : normalizeOptionalText(update.notes);
    const reviewedBy = update.reviewedBy === undefined ? existing.reviewedBy : normalizeOptionalText(update.reviewedBy);
    const reviewStatus = inferReviewStatus(update.reviewStatus, validity, outcome, notes, reviewedBy);
    const reviewedAt =
      reviewStatus === 'COMPLETED' ? update.reviewedAt ?? new Date().toISOString() : undefined;

    const next: SignalReviewEntry = syncAlertSnapshotState({
      ...existing,
      validity,
      outcome,
      notes,
      acknowledgedAt: existing.acknowledgedAt ?? reviewedAt,
      acknowledgedBy: existing.acknowledgedBy ?? reviewedBy,
      reviewedBy,
      reviewStatus,
      reviewedAt,
      updatedAt: update.reviewedAt ?? new Date().toISOString()
    });

    this.reviews.set(update.alertId, next);
    await this.persist();
    return next;
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy?: string, acknowledgedAt?: string): Promise<SignalReviewEntry> {
    await this.start();

    const existing = this.reviews.get(alertId);
    if (!existing) {
      throw new Error(`Signal review not found for alert ${alertId}`);
    }

    const next = syncAlertSnapshotState({
      ...existing,
      acknowledgedAt: acknowledgedAt ?? existing.acknowledgedAt ?? new Date().toISOString(),
      acknowledgedBy: normalizeOptionalText(acknowledgedBy) ?? existing.acknowledgedBy,
      updatedAt: acknowledgedAt ?? new Date().toISOString()
    });

    this.reviews.set(alertId, next);
    await this.persist();
    return next;
  }

  async applyAutoOutcome(
    alertId: string,
    autoOutcome: SignalReviewOutcome,
    autoLabeledAt?: string,
    autoLabeledBy?: string
  ): Promise<SignalReviewEntry> {
    await this.start();

    const existing = this.reviews.get(alertId);
    if (!existing) {
      throw new Error(`Signal review not found for alert ${alertId}`);
    }

    const timestamp = autoLabeledAt ?? new Date().toISOString();
    const next = syncAlertSnapshotState({
      ...existing,
      autoOutcome,
      autoLabeledAt: timestamp,
      autoLabeledBy: normalizeOptionalText(autoLabeledBy) ?? existing.autoLabeledBy ?? 'system-auto-labeler',
      updatedAt: timestamp
    });

    this.reviews.set(alertId, next);
    await this.persist();
    return next;
  }

  async recordEscalation(alertId: string, escalatedAt?: string): Promise<SignalReviewEntry> {
    await this.start();

    const existing = this.reviews.get(alertId);
    if (!existing) {
      throw new Error(`Signal review not found for alert ${alertId}`);
    }

    const timestamp = escalatedAt ?? new Date().toISOString();
    const next = syncAlertSnapshotState({
      ...existing,
      escalationCount: (existing.escalationCount ?? 0) + 1,
      lastEscalatedAt: timestamp,
      updatedAt: timestamp
    });

    this.reviews.set(alertId, next);
    await this.persist();
    return next;
  }

  async getReview(alertId: string): Promise<SignalReviewEntry | undefined> {
    await this.start();
    const review = this.reviews.get(alertId);
    return review ? structuredClone(review) : undefined;
  }

  async listReviews(status: SignalReviewStatus | 'ALL' = 'ALL', limit = 50): Promise<SignalReviewEntry[]> {
    await this.start();

    const all = sortReviews([...this.reviews.values()]);
    const filtered = status === 'ALL' ? all : all.filter((entry) => entry.reviewStatus === status);
    return filtered.slice(0, Math.max(1, limit)).map((entry) => structuredClone(entry));
  }

  async listAllReviews(): Promise<SignalReviewEntry[]> {
    await this.start();
    return sortReviews([...this.reviews.values()]).map((entry) => structuredClone(entry));
  }

  async summary(): Promise<SignalReviewSummary> {
    await this.start();

    let pending = 0;
    let completed = 0;
    let manualResolved = 0;
    let autoResolved = 0;
    let pendingOutcome = 0;
    for (const review of this.reviews.values()) {
      if (review.reviewStatus === 'PENDING') {
        pending += 1;
      } else {
        completed += 1;
      }

      if (review.outcome === 'WOULD_WIN' || review.outcome === 'WOULD_LOSE') {
        manualResolved += 1;
      } else if (review.autoOutcome === 'WOULD_WIN' || review.autoOutcome === 'WOULD_LOSE') {
        autoResolved += 1;
      } else {
        pendingOutcome += 1;
      }
    }

    return {
      pending,
      completed,
      total: this.reviews.size,
      manualResolved,
      autoResolved,
      pendingOutcome
    };
  }

  async listPendingAcknowledgements(limit = 100): Promise<SignalReviewEntry[]> {
    await this.start();
    const pending = sortReviews([...this.reviews.values()]).filter(
      (review) => review.reviewStatus === 'PENDING' && !review.acknowledgedAt
    );
    return pending.slice(0, Math.max(1, limit)).map((entry) => structuredClone(syncAlertSnapshotState(entry)));
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      let parsed: PersistedSignalReviewState;
      try {
        parsed = JSON.parse(raw) as PersistedSignalReviewState;
      } catch {
        this.reviews = new Map();
        return;
      }
      const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
      this.reviews = new Map(
        reviews.map((review) => {
          const normalized = syncAlertSnapshotState({
            ...review,
            escalationCount: review.escalationCount ?? 0
          });
          return [normalized.alertId, normalized];
        })
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        throw error;
      }
      this.reviews = new Map();
    }
  }

  private async persist(): Promise<void> {
    const snapshot: PersistedSignalReviewState = {
      reviews: sortReviews([...this.reviews.values()]).map((entry) => structuredClone(entry))
    };

    const write = async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    };

    this.writeChain = this.writeChain.catch(() => undefined).then(write);
    await this.writeChain;
  }
}
