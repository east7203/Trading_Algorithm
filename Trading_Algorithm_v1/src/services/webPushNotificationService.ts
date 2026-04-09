import fs from 'node:fs/promises';
import path from 'node:path';
import webpush from 'web-push';
import type { SignalAlert } from '../domain/types.js';
import type { AppNotificationMessage } from './operationalReminderService.js';
import type {
  AppNotificationCategory,
  AppNotificationPreferences,
  AppNotificationPriority
} from './notificationPreferences.js';
import {
  normalizeAppNotificationPreferences,
  shouldDeliverAppNotification
} from './notificationPreferences.js';

export interface WebPushSubscriptionPayload {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface WebPushSubscriptionRecord {
  endpoint: string;
  subscription: WebPushSubscriptionPayload;
  deviceLabel?: string;
  platform?: string;
  notificationPrefs: AppNotificationPreferences;
  subscribedAt: string;
  lastSeenAt: string;
}

export interface WebPushNotificationConfig {
  enabled: boolean;
  subscriptionsPath?: string;
  vapidKeysPath?: string;
  vapidSubject: string;
}

export interface WebPushNotificationStatus {
  enabled: boolean;
  ready: boolean;
  publicKey?: string;
  subscriberCount: number;
  lastError?: string;
}

interface VapidKeysFile {
  publicKey: string;
  privateKey: string;
}

interface WebPushSubscriptionMetadata {
  deviceLabel?: string;
  platform?: string;
  notificationPrefs?: Partial<AppNotificationPreferences>;
}

const WEB_PUSH_DELIVERY_TIMEOUT_MS = 10_000;

const fileExists = async (targetPath: string): Promise<boolean> =>
  fs
    .stat(targetPath)
    .then((stats) => stats.isFile())
    .catch(() => false);

const ensureParentDir = async (targetPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};

const signalSourceLabel = (alert: SignalAlert): string => {
  switch (alert.source) {
    case 'MANUAL_ENGINE':
      return 'Manual engine';
    case 'MANUAL_TEST':
      return 'Manual engine test';
    case 'PAPER_AUTONOMY':
      return 'Paper autonomy';
    default:
      return 'Signal engine';
  }
};

const resolveNotificationPriority = (
  category: AppNotificationCategory,
  requested?: AppNotificationPriority
): AppNotificationPriority => {
  if (requested) {
    return requested;
  }

  switch (category) {
    case 'trade-alert':
    case 'broker-recovery':
      return 'high';
    case 'trade-activity':
      return 'normal';
    case 'engine-update':
    default:
      return 'low';
  }
};

const normalizeSubscriptionRecord = (value: unknown): WebPushSubscriptionRecord | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<WebPushSubscriptionRecord>;
  if (
    typeof candidate.endpoint !== 'string'
    || !candidate.subscription?.endpoint
    || !candidate.subscription?.keys?.auth
    || !candidate.subscription?.keys?.p256dh
  ) {
    return null;
  }

  return {
    endpoint: candidate.endpoint,
    subscription: candidate.subscription,
    deviceLabel: typeof candidate.deviceLabel === 'string' ? candidate.deviceLabel : undefined,
    platform: typeof candidate.platform === 'string' ? candidate.platform : undefined,
    notificationPrefs: normalizeAppNotificationPreferences(candidate.notificationPrefs),
    subscribedAt:
      typeof candidate.subscribedAt === 'string' ? candidate.subscribedAt : new Date().toISOString(),
    lastSeenAt:
      typeof candidate.lastSeenAt === 'string' ? candidate.lastSeenAt : new Date().toISOString()
  };
};

class WebPushSubscriptionStore {
  private loaded = false;
  private records = new Map<string, WebPushSubscriptionRecord>();

  constructor(private readonly filePath?: string) {}

  async load(): Promise<void> {
    if (this.loaded || !this.filePath) {
      this.loaded = true;
      return;
    }

    this.loaded = true;
    if (!(await fileExists(this.filePath))) {
      return;
    }

    const raw = await fs.readFile(this.filePath, 'utf8');
    try {
      const parsed = JSON.parse(raw) as unknown[];
      for (const record of parsed) {
        const normalized = normalizeSubscriptionRecord(record);
        if (normalized) {
          this.records.set(normalized.endpoint, normalized);
        }
      }
    } catch {
      this.records.clear();
    }
  }

  list(): WebPushSubscriptionRecord[] {
    return [...this.records.values()];
  }

  count(): number {
    return this.records.size;
  }

  async upsert(
    record: Omit<WebPushSubscriptionRecord, 'subscribedAt' | 'lastSeenAt' | 'notificationPrefs'> & {
      notificationPrefs?: Partial<AppNotificationPreferences>;
    }
  ): Promise<void> {
    await this.load();
    const existing = this.records.get(record.endpoint);
    const now = new Date().toISOString();

    this.records.set(record.endpoint, {
      ...record,
      notificationPrefs: normalizeAppNotificationPreferences(record.notificationPrefs, existing?.notificationPrefs),
      subscribedAt: existing?.subscribedAt ?? now,
      lastSeenAt: now
    });

    await this.save();
  }

  async remove(endpoint: string): Promise<void> {
    await this.load();
    if (!this.records.delete(endpoint)) {
      return;
    }
    await this.save();
  }

  private async save(): Promise<void> {
    if (!this.filePath) {
      return;
    }

    await ensureParentDir(this.filePath);
    await fs.writeFile(this.filePath, JSON.stringify(this.list(), null, 2));
  }
}

export class WebPushNotificationService {
  private readonly store: WebPushSubscriptionStore;
  private ready = false;
  private publicKey: string | undefined;
  private privateKey: string | undefined;
  private lastError: string | undefined;

  constructor(private readonly config: WebPushNotificationConfig) {
    this.store = new WebPushSubscriptionStore(config.subscriptionsPath);
  }

  async start(): Promise<void> {
    if (!this.config.enabled || this.ready) {
      return;
    }

    await this.store.load();
    const keys = await this.loadOrCreateKeys();
    this.publicKey = keys.publicKey;
    this.privateKey = keys.privateKey;
    webpush.setVapidDetails(this.config.vapidSubject, keys.publicKey, keys.privateKey);
    this.ready = true;
    this.lastError = undefined;
  }

  status(): WebPushNotificationStatus {
    return {
      enabled: this.config.enabled,
      ready: this.ready,
      publicKey: this.publicKey,
      subscriberCount: this.store.count(),
      lastError: this.lastError
    };
  }

  async subscribe(
    subscription: WebPushSubscriptionPayload,
    metadata: WebPushSubscriptionMetadata = {}
  ): Promise<void> {
    if (!this.config.enabled) {
      throw new Error('Web push is disabled');
    }

    await this.start();
    await this.store.upsert({
      endpoint: subscription.endpoint,
      subscription,
      deviceLabel: metadata.deviceLabel,
      platform: metadata.platform,
      notificationPrefs: metadata.notificationPrefs
    });
  }

  async unsubscribe(endpoint: string): Promise<void> {
    if (!endpoint) {
      return;
    }

    await this.store.remove(endpoint);
  }

  async notifySignalAlert(
    alert: SignalAlert,
    delivery: { reason?: 'initial' | 'reminder'; reminderCount?: number } = {}
  ): Promise<{ attempted: number; delivered: number; removed: number }> {
    if (!this.config.enabled) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    await this.start();
    const category: AppNotificationCategory = 'trade-alert';
    const priority = resolveNotificationPriority(category, 'high');
    const subscriptions = this.store
      .list()
      .filter((record) => shouldDeliverAppNotification(record.notificationPrefs, category));
    if (subscriptions.length === 0) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    const reminderLabel =
      delivery.reason === 'reminder' && (delivery.reminderCount ?? 0) > 0
        ? `Reminder ${delivery.reminderCount}`
        : null;
    const targetUrl = `/mobile/?tab=signals&alertId=${encodeURIComponent(alert.alertId)}`;
    const payload = JSON.stringify({
      type: 'signal-alert',
      alertId: alert.alertId,
      title: reminderLabel ? `${reminderLabel}: ${alert.title}` : alert.title,
      body: [
        signalSourceLabel(alert),
        `${alert.symbol} ${alert.side}`,
        typeof alert.candidate.finalScore === 'number'
          ? `Score ${alert.candidate.finalScore.toFixed(1)}`
          : 'Score --',
        reminderLabel,
        alert.riskDecision.allowed ? 'Ready to take manually' : alert.riskDecision.reasonCodes[0] || 'Risk blocked'
      ]
        .filter(Boolean)
        .join(' • '),
      url: targetUrl,
      tag: alert.alertId,
      notificationCategory: category,
      notificationPriority: priority
    });

    return this.sendPayloadToAllSubscriptions(payload, subscriptions, priority);
  }

  async notifyGeneric(message: AppNotificationMessage): Promise<{ attempted: number; delivered: number; removed: number }> {
    if (!this.config.enabled) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    await this.start();
    const category: AppNotificationCategory = message.category ?? 'engine-update';
    const priority = resolveNotificationPriority(category, message.priority);
    const subscriptions = this.store
      .list()
      .filter((record) => shouldDeliverAppNotification(record.notificationPrefs, category));
    if (subscriptions.length === 0) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    const payload = JSON.stringify({
      type: 'app-notification',
      title: message.title,
      body: message.body,
      url: message.url || '/mobile/?tab=status',
      tag: message.tag || 'trading-assist-operational-reminder',
      notificationCategory: category,
      notificationPriority: priority
    });

    return this.sendPayloadToAllSubscriptions(payload, subscriptions, priority);
  }

  private async loadOrCreateKeys(): Promise<VapidKeysFile> {
    if (!this.config.vapidKeysPath) {
      return webpush.generateVAPIDKeys();
    }

    if (await fileExists(this.config.vapidKeysPath)) {
      const raw = await fs.readFile(this.config.vapidKeysPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<VapidKeysFile>;
      if (parsed.publicKey && parsed.privateKey) {
        return {
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey
        };
      }
    }

    const generated = webpush.generateVAPIDKeys();
    await ensureParentDir(this.config.vapidKeysPath);
    await fs.writeFile(this.config.vapidKeysPath, JSON.stringify(generated, null, 2));
    return generated;
  }

  private async sendPayloadToAllSubscriptions(
    payload: string,
    subscriptions: WebPushSubscriptionRecord[],
    priority: AppNotificationPriority
  ): Promise<{ attempted: number; delivered: number; removed: number }> {
    let delivered = 0;
    let removed = 0;
    const urgency =
      priority === 'high'
        ? 'high'
        : priority === 'normal'
          ? 'normal'
          : 'low';
    const ttlSeconds =
      priority === 'high'
        ? 600
        : priority === 'normal'
          ? 300
          : 120;

    const results = await Promise.all(
      subscriptions.map(async (record) => {
        try {
          await Promise.race([
            webpush.sendNotification(record.subscription as webpush.PushSubscription, payload, {
              TTL: ttlSeconds,
              urgency
            }),
            new Promise<never>((_, reject) => {
              setTimeout(() => reject(new Error(`Web push timed out after ${WEB_PUSH_DELIVERY_TIMEOUT_MS}ms`)), WEB_PUSH_DELIVERY_TIMEOUT_MS);
            })
          ]);
          return { delivered: 1, removed: 0 };
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          this.lastError = (error as Error).message;
          if (statusCode === 404 || statusCode === 410) {
            await this.store.remove(record.endpoint);
            return { delivered: 0, removed: 1 };
          }
          return { delivered: 0, removed: 0 };
        }
      })
    );

    for (const result of results) {
      delivered += result.delivered;
      removed += result.removed;
    }

    return {
      attempted: subscriptions.length,
      delivered,
      removed
    };
  }
}
