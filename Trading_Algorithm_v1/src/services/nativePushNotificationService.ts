import fs from 'node:fs/promises';
import path from 'node:path';
import { connect, constants } from 'node:http2';
import jwt from 'jsonwebtoken';
import type { SignalAlert } from '../domain/types.js';
import type { AppNotificationMessage } from './operationalReminderService.js';

export type NativePushPlatform = 'ios' | 'macos';

export interface NativePushDeviceRegistration {
  deviceToken: string;
  platform: NativePushPlatform;
  deviceLabel?: string;
}

export interface NativePushDeviceRecord extends NativePushDeviceRegistration {
  subscribedAt: string;
  lastSeenAt: string;
}

export interface NativePushNotificationConfig {
  enabled: boolean;
  devicesPath?: string;
  teamId?: string;
  keyId?: string;
  bundleId?: string;
  privateKeyPath?: string;
  privateKeyPem?: string;
  useSandbox: boolean;
}

export interface NativePushNotificationStatus {
  enabled: boolean;
  ready: boolean;
  deviceCount: number;
  bundleId?: string;
  environment: 'sandbox' | 'production';
  lastError?: string;
  readyReason?: string;
  missingConfigFields?: string[];
}

interface CachedProviderToken {
  token: string;
  expiresAtMs: number;
}

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

class NativePushDeviceStore {
  private loaded = false;
  private records = new Map<string, NativePushDeviceRecord>();

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

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as NativePushDeviceRecord[];
      for (const record of parsed) {
        if (record?.deviceToken) {
          this.records.set(record.deviceToken, record);
        }
      }
    } catch {
      this.records.clear();
    }
  }

  list(): NativePushDeviceRecord[] {
    return [...this.records.values()];
  }

  count(): number {
    return this.records.size;
  }

  async upsert(registration: NativePushDeviceRegistration): Promise<void> {
    await this.load();
    const now = new Date().toISOString();
    const existing = this.records.get(registration.deviceToken);

    this.records.set(registration.deviceToken, {
      ...registration,
      subscribedAt: existing?.subscribedAt ?? now,
      lastSeenAt: now
    });

    await this.save();
  }

  async remove(deviceToken: string): Promise<void> {
    await this.load();
    if (!this.records.delete(deviceToken)) {
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

export class NativePushNotificationService {
  private readonly store: NativePushDeviceStore;
  private started = false;
  private privateKeyPem: string | undefined;
  private cachedProviderToken: CachedProviderToken | undefined;
  private lastError: string | undefined;

  constructor(private readonly config: NativePushNotificationConfig) {
    this.store = new NativePushDeviceStore(config.devicesPath);
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    await this.store.load();
    this.privateKeyPem = await this.resolvePrivateKey().catch(() => undefined);
    this.started = true;
  }

  status(): NativePushNotificationStatus {
    const readiness = this.getReadiness();
    return {
      enabled: this.config.enabled,
      ready: readiness.ready,
      deviceCount: this.store.count(),
      bundleId: this.config.bundleId,
      environment: this.config.useSandbox ? 'sandbox' : 'production',
      lastError: this.lastError,
      readyReason: readiness.reason,
      missingConfigFields: readiness.missingFields
    };
  }

  async registerDevice(registration: NativePushDeviceRegistration): Promise<void> {
    await this.start();
    await this.store.upsert(registration);
  }

  async unregisterDevice(deviceToken: string): Promise<void> {
    await this.start();
    await this.store.remove(deviceToken);
  }

  async notifySignalAlert(alert: SignalAlert): Promise<{ attempted: number; delivered: number; removed: number }> {
    if (!this.config.enabled) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    await this.start();
    const devices = this.store.list();
    if (devices.length === 0) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    const readiness = this.getReadiness();
    if (!readiness.ready) {
      this.lastError = readiness.reason ?? 'APNs credentials are not fully configured';
      return { attempted: devices.length, delivered: 0, removed: 0 };
    }

    const providerToken = this.getProviderToken();
    const payload = {
      aps: {
        alert: {
          title: alert.title,
          body: [
            signalSourceLabel(alert),
            `${alert.symbol} ${alert.side}`,
            typeof alert.candidate.finalScore === 'number'
              ? `Score ${alert.candidate.finalScore.toFixed(1)}`
              : 'Score --',
            alert.riskDecision.allowed ? 'Ready to take manually' : alert.riskDecision.reasonCodes[0] || 'Risk blocked'
          ].join(' • ')
        },
        sound: 'default',
        badge: 1
      },
      signalAlertId: alert.alertId,
      symbol: alert.symbol,
      setupType: alert.setupType
    };

    let delivered = 0;
    let removed = 0;

    for (const device of devices) {
      const result = await this.sendPush(device.deviceToken, providerToken, payload, alert.alertId);
      if (result.ok) {
        delivered += 1;
        continue;
      }

      if (result.removeToken) {
        await this.store.remove(device.deviceToken);
        removed += 1;
      }

      if (result.reason) {
        this.lastError = result.reason;
      }
    }

    return {
      attempted: devices.length,
      delivered,
      removed
    };
  }

  async notifyGeneric(message: AppNotificationMessage): Promise<{ attempted: number; delivered: number; removed: number }> {
    if (!this.config.enabled) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    await this.start();
    const devices = this.store.list();
    if (devices.length === 0) {
      return { attempted: 0, delivered: 0, removed: 0 };
    }

    const readiness = this.getReadiness();
    if (!readiness.ready) {
      this.lastError = readiness.reason ?? 'APNs credentials are not fully configured';
      return { attempted: devices.length, delivered: 0, removed: 0 };
    }

    const providerToken = this.getProviderToken();
    const payload = {
      aps: {
        alert: {
          title: message.title,
          body: message.body
        },
        sound: 'default',
        badge: 1
      },
      type: 'operational-reminder',
      url: message.url || '/mobile/?tab=status',
      tag: message.tag || 'trading-assist-operational-reminder'
    };

    let delivered = 0;
    let removed = 0;
    const collapseId = message.tag || `generic-${Date.now()}`;

    for (const device of devices) {
      const result = await this.sendPush(device.deviceToken, providerToken, payload, collapseId);
      if (result.ok) {
        delivered += 1;
        continue;
      }

      if (result.removeToken) {
        await this.store.remove(device.deviceToken);
        removed += 1;
      }

      if (result.reason) {
        this.lastError = result.reason;
      }
    }

    return {
      attempted: devices.length,
      delivered,
      removed
    };
  }

  private getReadiness(): { ready: boolean; reason?: string; missingFields?: string[] } {
    if (!this.config.enabled) {
      return {
        ready: false,
        reason: 'Native push is disabled in configuration',
        missingFields: ['NATIVE_PUSH_ENABLED']
      };
    }

    const missingFields: string[] = [];
    if (!this.config.teamId) {
      missingFields.push('APNS_TEAM_ID');
    }
    if (!this.config.keyId) {
      missingFields.push('APNS_KEY_ID');
    }
    if (!this.config.bundleId) {
      missingFields.push('APNS_BUNDLE_ID');
    }
    if (!this.privateKeyPem) {
      missingFields.push('APNS_PRIVATE_KEY_PATH or APNS_PRIVATE_KEY_PEM');
    }

    if (missingFields.length > 0) {
      return {
        ready: false,
        reason: `Missing APNs config: ${missingFields.join(', ')}`,
        missingFields
      };
    }

    return {
      ready: true
    };
  }

  private async resolvePrivateKey(): Promise<string | undefined> {
    if (this.config.privateKeyPem && this.config.privateKeyPem.trim().length > 0) {
      return this.config.privateKeyPem;
    }

    if (this.config.privateKeyPath && (await fileExists(this.config.privateKeyPath))) {
      return fs.readFile(this.config.privateKeyPath, 'utf8');
    }

    return undefined;
  }

  private getProviderToken(): string {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (this.cachedProviderToken && this.cachedProviderToken.expiresAtMs > Date.now()) {
      return this.cachedProviderToken.token;
    }

    const token = jwt.sign(
      {
        iss: this.config.teamId,
        iat: nowSeconds
      },
      this.privateKeyPem as string,
      {
        algorithm: 'ES256',
        header: {
          alg: 'ES256',
          kid: this.config.keyId
        }
      }
    );

    this.cachedProviderToken = {
      token,
      expiresAtMs: Date.now() + 50 * 60 * 1000
    };

    return token;
  }

  private async sendPush(
    deviceToken: string,
    providerToken: string,
    payload: Record<string, unknown>,
    collapseId: string
  ): Promise<{ ok: boolean; removeToken: boolean; reason?: string }> {
    const endpoint = this.config.useSandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

    return new Promise((resolve) => {
      const client = connect(endpoint);
      let statusCode = 0;
      let responseBody = '';

      const cleanup = (): void => {
        try {
          client.close();
        } catch {
          // ignore close errors
        }
      };

      client.on('error', (error) => {
        this.lastError = error.message;
        cleanup();
        resolve({ ok: false, removeToken: false, reason: error.message });
      });

      const request = client.request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken}`,
        'apns-topic': this.config.bundleId as string,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-collapse-id': collapseId,
        'content-type': 'application/json'
      });

      request.setEncoding('utf8');
      request.on('response', (headers) => {
        statusCode = Number(headers[constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      request.on('data', (chunk: string) => {
        responseBody += chunk;
      });
      request.on('error', (error) => {
        this.lastError = error.message;
        cleanup();
        resolve({ ok: false, removeToken: false, reason: error.message });
      });
      request.on('end', () => {
        cleanup();
        if (statusCode === 200) {
          resolve({ ok: true, removeToken: false });
          return;
        }

        let reason: string | undefined;
        try {
          reason = JSON.parse(responseBody).reason;
        } catch {
          reason = responseBody || `APNs returned ${statusCode}`;
        }

        const removeToken =
          statusCode === 410 ||
          reason === 'BadDeviceToken' ||
          reason === 'DeviceTokenNotForTopic' ||
          reason === 'Unregistered';

        resolve({
          ok: false,
          removeToken,
          reason
        });
      });

      request.end(JSON.stringify(payload));
    });
  }
}
