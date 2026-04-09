import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  AppNotificationCategory,
  AppNotificationPriority
} from './notificationPreferences.js';

interface OperationalReminderState {
  lastSentDayKey?: string;
  lastSentAt?: string;
}

export interface AppNotificationMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  category?: AppNotificationCategory;
  priority?: AppNotificationPriority;
}

export interface TelegramNotificationMessage {
  title: string;
  lines?: string[];
  buttons?: Array<{
    text: string;
    url: string;
  }>;
}

export interface AppNotifier {
  notifyGeneric(message: AppNotificationMessage): Promise<{ attempted: number; delivered: number; removed: number }>;
}

export interface TelegramNotifier {
  notifyGeneric(message: TelegramNotificationMessage): Promise<{ sent: boolean }>;
}

export interface OperationalReminderConfig {
  enabled: boolean;
  timezone: string;
  sundayHour: number;
  sundayMinute: number;
  checkIntervalMs: number;
  statePath?: string;
  appUrl: string;
  ibkrTargetUrl: string;
  ibkrMobileUrl: string;
}

export interface OperationalReminderStatus {
  enabled: boolean;
  started: boolean;
  timezone: string;
  sundayTime: string;
  lastSentAt?: string;
  lastError?: string;
}

export type OperationalReminderHook = (kind: 'scheduled' | 'test') => Promise<void>;

const fileExists = async (targetPath: string): Promise<boolean> =>
  fs
    .stat(targetPath)
    .then((stats) => stats.isFile())
    .catch(() => false);

const ensureParentDir = async (targetPath: string): Promise<void> => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

const getFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = dtfCache.get(timezone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  dtfCache.set(timezone, formatter);
  return formatter;
};

const getLocalTimeParts = (
  timestamp: string,
  timezone: string
): { weekday: string; dayKey: string; minuteOfDay: number } => {
  const formatter = getFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestamp));
  const find = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type);
    return part ? part.value : '';
  };

  const year = find('year');
  const month = find('month');
  const day = find('day');
  const hour = Number(find('hour'));
  const minute = Number(find('minute'));

  return {
    weekday: find('weekday'),
    dayKey: `${year}-${month}-${day}`,
    minuteOfDay: hour * 60 + minute
  };
};

export class OperationalReminderService {
  private started = false;
  private stateLoaded = false;
  private timer: NodeJS.Timeout | undefined;
  private lastError: string | undefined;
  private state: OperationalReminderState = {};

  constructor(
    private readonly config: OperationalReminderConfig,
    private readonly appNotifier?: AppNotifier | null,
    private readonly telegramNotifier?: TelegramNotifier | null,
    private readonly onReminderHook?: OperationalReminderHook
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled || this.started) {
      return;
    }

    await this.loadState();
    this.started = true;
    this.timer = setInterval(() => {
      void this.checkNow();
    }, this.config.checkIntervalMs);
    void this.checkNow();
  }

  stop(): void {
    this.started = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  status(): OperationalReminderStatus {
    return {
      enabled: this.config.enabled,
      started: this.started,
      timezone: this.config.timezone,
      sundayTime: `${String(this.config.sundayHour).padStart(2, '0')}:${String(this.config.sundayMinute).padStart(
        2,
        '0'
      )}`,
      lastSentAt: this.state.lastSentAt,
      lastError: this.lastError
    };
  }

  async checkNow(now = new Date()): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }

    await this.loadState();

    const local = getLocalTimeParts(now.toISOString(), this.config.timezone);
    const targetMinute = this.config.sundayHour * 60 + this.config.sundayMinute;
    if (local.weekday !== 'Sun' || local.minuteOfDay < targetMinute) {
      return false;
    }

    if (this.state.lastSentDayKey === local.dayKey) {
      return false;
    }

    await this.sendReminder('scheduled', local.dayKey);
    return true;
  }

  async sendTestReminder(): Promise<void> {
    await this.loadState();
    await this.sendReminder('test');
  }

  private async sendReminder(kind: 'scheduled' | 'test', dayKey?: string): Promise<void> {
    const title = kind === 'test' ? 'IBKR login reminder test' : 'IBKR login reminder';
    const body =
      kind === 'test'
        ? 'Test: the server has started the IB Gateway recovery flow. Approve IB Key from your phone if IBKR prompts you.'
        : 'Weekly reminder: the server has started the IB Gateway recovery flow. Approve IB Key from your phone if IBKR prompts you.';
    const statusUrl = `${this.config.appUrl}/mobile/?tab=status&focus=ibkr-login`;

    try {
      if (this.onReminderHook) {
        try {
          await this.onReminderHook(kind);
        } catch (error) {
          this.lastError = (error as Error).message;
        }
      }

      let appDelivery:
        | {
            attempted: number;
            delivered: number;
            removed: number;
          }
        | undefined;
      let appError: string | undefined;

      if (this.appNotifier) {
        try {
          appDelivery = await this.appNotifier.notifyGeneric({
            title,
            body,
            url: statusUrl,
            tag: kind === 'test' ? 'ibkr-login-reminder-test' : 'ibkr-login-reminder',
            category: 'broker-recovery',
            priority: 'high'
          });
        } catch (error) {
          appError = (error as Error).message;
        }
      }

      const shouldFallbackToTelegram =
        Boolean(this.telegramNotifier) && (!this.appNotifier || appError || (appDelivery?.delivered ?? 0) === 0);

      if (shouldFallbackToTelegram) {
        await this.telegramNotifier?.notifyGeneric({
          title,
          lines: [
            body,
            'The server has already submitted the IB Gateway login.',
            'The server also uses IB Gateway fallback controls if the official push does not land cleanly.',
            'Approve the official IBKR push on your phone if IBKR asks for IB Key.',
            kind === 'test' ? 'This is a manual verification send.' : `Scheduled for Sunday ${this.status().sundayTime}.`
          ],
          buttons: [
            { text: 'Open Status', url: statusUrl },
            { text: 'Last-Resort Website', url: this.config.ibkrMobileUrl }
          ]
        });
      }

      this.lastError = undefined;
      if (dayKey) {
        this.state.lastSentDayKey = dayKey;
        this.state.lastSentAt = new Date().toISOString();
        await this.saveState();
      }
    } catch (error) {
      this.lastError = (error as Error).message;
    }
  }

  private async loadState(): Promise<void> {
    if (this.stateLoaded) {
      return;
    }

    this.stateLoaded = true;
    if (!this.config.statePath || !(await fileExists(this.config.statePath))) {
      return;
    }

    try {
      const raw = await fs.readFile(this.config.statePath, 'utf8');
      const parsed = JSON.parse(raw) as OperationalReminderState;
      this.state = {
        lastSentDayKey: parsed.lastSentDayKey,
        lastSentAt: parsed.lastSentAt
      };
    } catch {
      this.state = {};
    }
  }

  private async saveState(): Promise<void> {
    if (!this.config.statePath) {
      return;
    }

    await ensureParentDir(this.config.statePath);
    await fs.writeFile(this.config.statePath, JSON.stringify(this.state, null, 2));
  }
}
