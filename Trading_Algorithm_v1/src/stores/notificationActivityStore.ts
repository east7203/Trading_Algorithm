import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Side } from '../domain/types.js';
import type { AppNotificationCategory, AppNotificationPriority } from '../services/notificationPreferences.js';

export type NotificationActivityKind = 'generic' | 'signal-alert';
export type NotificationActivityDeliveryReason = 'initial' | 'reminder';
export type NotificationActivityTelegramTriggerReason =
  | 'fallback-disabled'
  | 'service-unavailable'
  | 'no-app-channel'
  | 'app-delivered'
  | 'app-error'
  | 'zero-app-deliveries';

export interface NotificationActivityEntryInput {
  at: string;
  kind: NotificationActivityKind;
  title: string;
  body?: string;
  category: AppNotificationCategory;
  priority: AppNotificationPriority;
  tag?: string;
  url?: string;
  source?: string;
  symbol?: string;
  side?: Side;
  setupType?: string;
  deliveryReason?: NotificationActivityDeliveryReason;
  reminderCount?: number;
  app: {
    attempted: number;
    delivered: number;
    removed: number;
    error?: string;
  };
  telegram: {
    fallbackRequested: boolean;
    triggerReason: NotificationActivityTelegramTriggerReason;
    attempted: boolean;
    sent: boolean;
    error?: string;
  };
}

export interface NotificationActivityEntry extends NotificationActivityEntryInput {
  id: string;
}

const MAX_ACTIVITY_ENTRIES = 80;

const normalizeTimestamp = (value: unknown): string => {
  if (typeof value !== 'string') {
    return new Date().toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
};

const normalizeText = (value: unknown, fallback?: string): string | undefined => {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const normalizeInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

const normalizeActivityKind = (value: unknown): NotificationActivityKind =>
  value === 'signal-alert' ? 'signal-alert' : 'generic';

const normalizeCategory = (value: unknown): AppNotificationCategory => {
  switch (value) {
    case 'trade-alert':
    case 'trade-activity':
    case 'broker-recovery':
    case 'engine-update':
      return value;
    default:
      return 'engine-update';
  }
};

const normalizePriority = (value: unknown): AppNotificationPriority => {
  switch (value) {
    case 'high':
    case 'normal':
    case 'low':
      return value;
    default:
      return 'low';
  }
};

const normalizeTelegramTriggerReason = (value: unknown): NotificationActivityTelegramTriggerReason => {
  switch (value) {
    case 'fallback-disabled':
    case 'service-unavailable':
    case 'no-app-channel':
    case 'app-delivered':
    case 'app-error':
    case 'zero-app-deliveries':
      return value;
    default:
      return 'fallback-disabled';
  }
};

const normalizeEntry = (value: unknown): NotificationActivityEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<NotificationActivityEntry>;
  const app = candidate.app ?? { attempted: 0, delivered: 0, removed: 0 };
  const telegram = candidate.telegram ?? {
    fallbackRequested: false,
    triggerReason: 'fallback-disabled',
    attempted: false,
    sent: false
  };

  return {
    id:
      typeof candidate.id === 'string' && candidate.id.trim().length > 0
        ? candidate.id.trim()
        : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`,
    at: normalizeTimestamp(candidate.at),
    kind: normalizeActivityKind(candidate.kind),
    title: normalizeText(candidate.title, 'Notification event') ?? 'Notification event',
    body: normalizeText(candidate.body),
    category: normalizeCategory(candidate.category),
    priority: normalizePriority(candidate.priority),
    tag: normalizeText(candidate.tag),
    url: normalizeText(candidate.url),
    source: normalizeText(candidate.source),
    symbol: normalizeText(candidate.symbol),
    side: candidate.side === 'LONG' || candidate.side === 'SHORT' ? candidate.side : undefined,
    setupType: normalizeText(candidate.setupType),
    deliveryReason: candidate.deliveryReason === 'reminder' ? 'reminder' : candidate.deliveryReason === 'initial' ? 'initial' : undefined,
    reminderCount: normalizeInteger(candidate.reminderCount),
    app: {
      attempted: normalizeInteger(app.attempted),
      delivered: normalizeInteger(app.delivered),
      removed: normalizeInteger(app.removed),
      error: normalizeText(app.error)
    },
    telegram: {
      fallbackRequested: telegram.fallbackRequested === true,
      triggerReason: normalizeTelegramTriggerReason(telegram.triggerReason),
      attempted: telegram.attempted === true,
      sent: telegram.sent === true,
      error: normalizeText(telegram.error)
    }
  };
};

const sortEntries = (entries: NotificationActivityEntry[]): NotificationActivityEntry[] =>
  [...entries]
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, MAX_ACTIVITY_ENTRIES);

export const resolveNotificationActivityStorePath = (override?: string): string => {
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  if (process.env.NODE_ENV === 'test') {
    return path.resolve(
      os.tmpdir(),
      `trading-algorithm-notification-activity-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
  }

  return path.resolve(process.cwd(), 'data', 'notifications', 'activity.json');
};

export class NotificationActivityStore {
  private entries: NotificationActivityEntry[] = [];
  private started = false;
  private startPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

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

  list(limit = 20): NotificationActivityEntry[] {
    return this.entries
      .slice(0, Math.max(1, limit))
      .map((entry) => ({
        ...entry,
        app: { ...entry.app },
        telegram: { ...entry.telegram }
      }));
  }

  async append(entry: NotificationActivityEntryInput): Promise<NotificationActivityEntry> {
    await this.start();
    const normalized = normalizeEntry({
      ...entry,
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
    });

    if (!normalized) {
      throw new Error('Invalid notification activity entry');
    }

    this.entries = sortEntries([normalized, ...this.entries]);
    await this.persist();
    return {
      ...normalized,
      app: { ...normalized.app },
      telegram: { ...normalized.telegram }
    };
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as unknown[];
      this.entries = sortEntries(
        Array.isArray(parsed)
          ? parsed
              .map((entry) => normalizeEntry(entry))
              .filter((entry): entry is NotificationActivityEntry => entry !== null)
          : []
      );
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.entries = [];
      }
    }
  }

  private async persist(): Promise<void> {
    const snapshot = this.list(MAX_ACTIVITY_ENTRIES);
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    });
    await this.writeChain;
  }
}
