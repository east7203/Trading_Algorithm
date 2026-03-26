import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { generateSetupCandidates } from './domain/setupDetectors.js';
import type { SymbolCode } from './domain/types.js';
import { rankCandidates } from './services/ranker.js';
import { evaluateRisk } from './services/riskEngine.js';
import { ExecutionService } from './services/executionService.js';
import { InMemoryTradeLockerClient, type TradeLockerClient } from './integrations/tradelocker/TradeLockerClient.js';
import {
  InMemoryEconomicCalendarClient,
  ForexFactoryCalendarClient,
  TradingEconomicsCalendarClient,
  type EconomicCalendarClient
} from './integrations/news/EconomicCalendarClient.js';
import { defaultRankingModel, loadRankingModelFromPath, type RankingModel } from './services/rankingModel.js';
import { RankingModelStore } from './services/rankingModelStore.js';
import { SignalMonitorService, type SignalMonitorStatus } from './services/signalMonitorService.js';
import { MarketResearchService, type MarketResearchConfig, type MarketResearchStatus } from './services/marketResearchService.js';
import {
  NativePushNotificationService,
  type NativePushNotificationConfig,
  type NativePushNotificationStatus
} from './services/nativePushNotificationService.js';
import { TelegramAlertService, type TelegramAlertConfig, type TelegramAlertStatus } from './services/telegramAlertService.js';
import {
  WebPushNotificationService,
  type WebPushNotificationConfig,
  type WebPushNotificationStatus
} from './services/webPushNotificationService.js';
import {
  OperationalReminderService,
  type AppNotificationMessage,
  type AppNotifier,
  type OperationalReminderConfig,
  type OperationalReminderStatus
} from './services/operationalReminderService.js';
import { shouldNotifyIbkrRecovery } from './services/ibkrRecoveryNotificationPolicy.js';
import { JournalStore } from './stores/journalStore.js';
import { RiskConfigStore } from './stores/riskConfigStore.js';
import {
  IbkrReconnectStateStore,
  type IbkrReconnectHistoryEntry,
  type IbkrReconnectStateSnapshot
} from './stores/ibkrReconnectStateStore.js';
import { SignalMonitorSettingsStore } from './stores/signalMonitorSettingsStore.js';
import { SignalReviewStore } from './stores/signalReviewStore.js';
import { ContinuousTrainingService, type ContinuousTrainingConfig } from './training/continuousTrainingService.js';
import {
  buildLearningFeedbackDataset,
  summarizeLearningPerformance
} from './training/liveLearning.js';
import type { OneMinuteBar } from './training/historicalTrainer.js';
import {
  executionApproveBodySchema,
  executionProposeBodySchema,
  nativePushRegisterBodySchema,
  nativePushUnregisterBodySchema,
  riskCheckBodySchema,
  riskConfigPatchSchema,
  signalGenerateBodySchema,
  signalAlertAcknowledgeBodySchema,
  signalMonitorSettingsPatchSchema,
  signalRankBodySchema,
  signalReviewStatusSchema,
  signalReviewUpsertBodySchema,
  trainingIngestBarsBodySchema,
  webPushSubscribeBodySchema,
  webPushUnsubscribeBodySchema
} from './routes/schemas.js';

export interface AppContext {
  app: FastifyInstance;
  journalStore: JournalStore;
  riskConfigStore: RiskConfigStore;
  executionService: ExecutionService;
  tradeLockerClient: TradeLockerClient;
  calendarClient: EconomicCalendarClient;
  rankingModel: RankingModel;
  rankingModelStore: RankingModelStore;
  continuousTrainingService: ContinuousTrainingService | null;
  signalMonitorService: SignalMonitorService | null;
  signalMonitorSettingsStore: SignalMonitorSettingsStore;
  signalReviewStore: SignalReviewStore;
  nativePushNotificationService: NativePushNotificationService | null;
  webPushNotificationService: WebPushNotificationService | null;
  telegramAlertService: TelegramAlertService | null;
  operationalReminderService: OperationalReminderService | null;
  marketResearchService: MarketResearchService | null;
}

interface BuildAppOptions {
  tradeLockerClient?: TradeLockerClient;
  calendarClient?: EconomicCalendarClient;
  journalStore?: JournalStore;
  riskConfigStore?: RiskConfigStore;
  rankingModel?: RankingModel;
  rankingModelStore?: RankingModelStore;
  signalMonitorSettingsStore?: SignalMonitorSettingsStore;
  signalMonitorSettingsStorePath?: string;
  signalReviewStore?: SignalReviewStore;
  signalReviewStorePath?: string;
  ibkrReconnectStateStore?: IbkrReconnectStateStore;
  ibkrReconnectStateStorePath?: string;
  continuousTrainingEnabled?: boolean;
  continuousTrainingConfig?: Partial<ContinuousTrainingConfig>;
  continuousTrainingService?: ContinuousTrainingService | null;
  nativePushEnabled?: boolean;
  nativePushConfig?: Partial<NativePushNotificationConfig>;
  nativePushNotificationService?: NativePushNotificationService | null;
  telegramAlertEnabled?: boolean;
  telegramAlertConfig?: Partial<TelegramAlertConfig>;
  telegramAlertService?: TelegramAlertService | null;
  operationalReminderEnabled?: boolean;
  operationalReminderConfig?: Partial<OperationalReminderConfig>;
  operationalReminderService?: OperationalReminderService | null;
  marketResearchEnabled?: boolean;
  marketResearchConfig?: Partial<MarketResearchConfig>;
  marketResearchService?: MarketResearchService | null;
  ibkrLoginTrigger?: (source: string) => Promise<{ ok: boolean; skipped?: boolean; reason?: string }>;
  ibkrResendPushTrigger?: (source: string) => Promise<{ ok: boolean; skipped?: boolean; reason?: string }>;
  webPushEnabled?: boolean;
  webPushConfig?: Partial<WebPushNotificationConfig>;
  webPushNotificationService?: WebPushNotificationService | null;
  signalMonitorEnabled?: boolean;
  signalMonitorConfig?: Partial<SignalMonitorConfigInput>;
  signalMonitorService?: SignalMonitorService | null;
}

interface SignalMonitorConfigInput {
  enabled: boolean;
  timezone: string;
  sessionStartHour: number;
  sessionStartMinute: number;
  sessionEndHour: number;
  sessionEndMinute: number;
  nyRangeMinutes: number;
  lookbackBars1m: number;
  outcomeLookaheadBars1m: number;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  archivePath?: string;
  maxBarsPerSymbol: number;
  maxAlerts: number;
  escalationCheckIntervalMs: number;
  escalationDelaysMs: number[];
  minFinalScore: number;
  accountSnapshot: {
    equity: number;
    dailyLossPct: number;
    sessionLossPct: number;
    consecutiveLosses: number;
  };
  marketConditions: {
    spreadPoints: number;
    expectedSlippagePoints: number;
  };
}

interface MarketResearchConfigInput {
  enabled: boolean;
  archivePath?: string;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  maxBarsPerSymbol: number;
  focusSymbols: SymbolCode[];
  flipNotificationMinConfidence: number;
  evaluationMinutes: number;
}

interface IbkrLoginTriggerResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  stdout?: string;
  stderr?: string;
}

const parseOrThrow = <T>(result: { success: true; data: T } | { success: false; error: unknown }): T => {
  if (!result.success) {
    throw result.error;
  }
  return result.data;
};

const parseBooleanEnv = (name: string, fallback: boolean): boolean => {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseIntEnv = (name: string, fallback: number, min?: number, max?: number): number => {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const lowChecked = min === undefined ? parsed : Math.max(min, parsed);
  return max === undefined ? lowChecked : Math.min(max, lowChecked);
};

const parseFloatEnv = (name: string, fallback: number, min?: number, max?: number): number => {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const lowChecked = min === undefined ? parsed : Math.max(min, parsed);
  return max === undefined ? lowChecked : Math.min(max, lowChecked);
};

const parseCsvEnv = (name: string, fallback: string[]): string[] => {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }

  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return parsed.length > 0 ? parsed : fallback;
};

const compactText = (value: string | undefined, maxLength = 180): string | undefined => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const formatWinRateDelta = (value?: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  const points = value * 100;
  const sign = points > 0 ? '+' : '';
  return `${sign}${points.toFixed(2)} pts`;
};

type CmeEquitySessionState = 'OPEN' | 'DAILY_BREAK' | 'WEEKEND_CLOSED';

const getTimeZoneClockParts = (
  value: Date | string,
  timeZone: string
): { weekday: string; hour: number; minute: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(typeof value === 'string' ? new Date(value) : value);
  return {
    weekday: parts.find((part) => part.type === 'weekday')?.value ?? 'Mon',
    hour: Number(parts.find((part) => part.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((part) => part.type === 'minute')?.value ?? '0')
  };
};

const getCmeEquitySessionState = (now: Date): CmeEquitySessionState => {
  const { weekday, hour, minute } = getTimeZoneClockParts(now, 'America/Chicago');
  const minuteOfDay = hour * 60 + minute;
  const dailyClose = 16 * 60;
  const dailyReopen = 17 * 60;

  switch (weekday) {
    case 'Sun':
      return minuteOfDay >= dailyReopen ? 'OPEN' : 'WEEKEND_CLOSED';
    case 'Mon':
    case 'Tue':
    case 'Wed':
    case 'Thu':
      if (minuteOfDay < dailyClose) {
        return 'OPEN';
      }
      if (minuteOfDay < dailyReopen) {
        return 'DAILY_BREAK';
      }
      return 'OPEN';
    case 'Fri':
      return minuteOfDay < dailyClose ? 'OPEN' : 'WEEKEND_CLOSED';
    default:
      return 'WEEKEND_CLOSED';
  }
};

const readRecentArchiveBars = async (archivePath: string | undefined, maxLines = 40): Promise<OneMinuteBar[]> => {
  if (!archivePath) {
    return [];
  }
  try {
    const stats = await fs.stat(archivePath);
    if (!stats.isFile()) {
      return [];
    }
    const bytesToRead = Math.min(stats.size, 64 * 1024);
    const handle = await fs.open(archivePath, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      await handle.read(buffer, 0, bytesToRead, Math.max(0, stats.size - bytesToRead));
      const lines = buffer
        .toString('utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .slice(-maxLines);
      const parsed: OneMinuteBar[] = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line) as OneMinuteBar);
        } catch {
          // Ignore malformed rows.
        }
      }
      return parsed;
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
};

const detectFrozenArchiveFeed = (
  bars: OneMinuteBar[],
  symbols: string[],
  latestBarTimestamp: string | undefined
): boolean => {
  if (!latestBarTimestamp || symbols.length === 0) {
    return false;
  }
  const latestBarMs = Date.parse(latestBarTimestamp);
  if (!Number.isFinite(latestBarMs)) {
    return false;
  }

  return symbols.every((symbol) => {
    const recent = bars
      .filter((bar) => bar.symbol === symbol && latestBarMs - Date.parse(bar.timestamp) <= 6 * 60 * 1000)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-4);
    if (recent.length < 4) {
      return false;
    }
    const first = recent[0];
    return recent.every(
      (bar) =>
        bar.open === first.open &&
        bar.high === first.high &&
        bar.low === first.low &&
        bar.close === first.close &&
        Number(bar.volume ?? 0) === 0
    );
  });
};

const classifyLiveFeedStatus = (
  started: boolean,
  latestBarTimestamp: string | undefined,
  frozenFeed = false
): {
  status: 'OFFLINE' | 'WAITING' | 'LIVE' | 'FROZEN' | 'DELAYED' | 'STALE' | 'AFTER_HOURS';
  barAgeMs?: number;
  sessionState: CmeEquitySessionState;
} => {
  const sessionState = getCmeEquitySessionState(new Date());
  if (!started) {
    return { status: 'OFFLINE', sessionState };
  }
  if (!latestBarTimestamp) {
    return { status: 'WAITING', sessionState };
  }

  const barAgeMs = Math.max(0, Date.now() - Date.parse(latestBarTimestamp));
  if (sessionState === 'OPEN' && frozenFeed && barAgeMs <= 10 * 60 * 1000) {
    return { status: 'FROZEN', barAgeMs, sessionState };
  }
  if (barAgeMs <= 5 * 60 * 1000) {
    return { status: 'LIVE', barAgeMs, sessionState };
  }
  if (sessionState !== 'OPEN') {
    return { status: 'AFTER_HOURS', barAgeMs, sessionState };
  }
  if (barAgeMs <= 20 * 60 * 1000) {
    return { status: 'DELAYED', barAgeMs, sessionState };
  }
  return { status: 'STALE', barAgeMs, sessionState };
};

const parseOptionalPathEnv = (name: string, fallback?: string): string | undefined => {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? path.resolve(process.cwd(), trimmed) : undefined;
};

const DEFAULT_IBKR_CONSOLE_URL =
  'https://ibkr-console.167-172-252-171.sslip.io/vnc.html?autoconnect=1&resize=scale&view_clip=1&path=websockify';
const DEFAULT_IBKR_LOGIN_URL = 'https://ndcdyn.interactivebrokers.com/sso/Login';

const runCommand = async (command: string, args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const isLoopbackIp = (ip: string | undefined): boolean => {
  if (!ip) {
    return false;
  }
  const normalized = ip.trim();
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '::ffff:127.0.0.1'
  );
};

const resolveInitialRankingModel = (override?: RankingModel): RankingModel => {
  if (override) {
    return override;
  }
  const modelPath = process.env.RANKING_MODEL_PATH;
  if (!modelPath) {
    return defaultRankingModel();
  }
  return loadRankingModelFromPath(modelPath) ?? defaultRankingModel();
};

const resolveContinuousTrainingConfig = (
  overrides: Partial<ContinuousTrainingConfig> = {}
): ContinuousTrainingConfig => {
  const defaults: ContinuousTrainingConfig = {
    enabled: parseBooleanEnv('CONTINUOUS_TRAINING_ENABLED', false),
    retrainIntervalMs: parseIntEnv('CONTINUOUS_TRAINING_RETRAIN_MINUTES', 60, 1) * 60 * 1000,
    minBarsToTrain: parseIntEnv('CONTINUOUS_TRAINING_MIN_BARS', 300, 50),
    minExamplesToTrain: parseIntEnv('CONTINUOUS_TRAINING_MIN_EXAMPLES', 120, 20),
    minNewBarsForRetrain: parseIntEnv('CONTINUOUS_TRAINING_MIN_NEW_BARS', 120, 1),
    maxBarsRetained: parseIntEnv('CONTINUOUS_TRAINING_MAX_BARS', 300_000, 1_000),
    validationPct: parseFloatEnv('CONTINUOUS_TRAINING_VALIDATION_PCT', 20, 0, 99.9),
    bootstrapCsvDir: parseOptionalPathEnv(
      'CONTINUOUS_TRAINING_BOOTSTRAP_DIR',
      path.resolve(process.cwd(), 'data', 'historical')
    ),
    bootstrapRecursive: parseBooleanEnv('CONTINUOUS_TRAINING_BOOTSTRAP_RECURSIVE', true),
    liveArchivePath: parseOptionalPathEnv(
      'CONTINUOUS_TRAINING_ARCHIVE_PATH',
      path.resolve(process.cwd(), 'data', 'live', 'one-minute-bars.ndjson')
    ),
    modelOutputPath: parseOptionalPathEnv(
      'CONTINUOUS_TRAINING_MODEL_OUTPUT',
      path.resolve(process.cwd(), 'data', 'models', 'latest-live-model.json')
    ),
    challengerOutputPath: parseOptionalPathEnv(
      'CONTINUOUS_TRAINING_CHALLENGER_OUTPUT',
      path.resolve(process.cwd(), 'data', 'models', 'latest-live-challenger-model.json')
    ),
    historyOutputPath: parseOptionalPathEnv(
      'CONTINUOUS_TRAINING_HISTORY_OUTPUT',
      path.resolve(process.cwd(), 'data', 'models', 'training-history.json')
    ),
    historyLimit: parseIntEnv('CONTINUOUS_TRAINING_HISTORY_LIMIT', 25, 1, 500),
    promotionMinDelta: parseFloatEnv('CONTINUOUS_TRAINING_PROMOTION_MIN_DELTA', 0.001, 0),
    minEvaluationTopPicks: parseIntEnv('CONTINUOUS_TRAINING_MIN_EVAL_TOP_PICKS', 20, 1),
    alwaysPromoteLatestModel: parseBooleanEnv('CONTINUOUS_TRAINING_ALWAYS_PROMOTE_LATEST', false),
    trainingOptions: {
      timezone: process.env.CONTINUOUS_TRAINING_TIMEZONE ?? 'America/New_York',
      sessionStartHour: parseIntEnv('CONTINUOUS_TRAINING_SESSION_START_HOUR', 8, 0, 23),
      sessionStartMinute: parseIntEnv('CONTINUOUS_TRAINING_SESSION_START_MINUTE', 30, 0, 59),
      sessionEndHour: parseIntEnv('CONTINUOUS_TRAINING_SESSION_END_HOUR', 11, 0, 23),
      sessionEndMinute: parseIntEnv('CONTINUOUS_TRAINING_SESSION_END_MINUTE', 30, 0, 59),
      nyRangeMinutes: parseIntEnv('CONTINUOUS_TRAINING_NY_RANGE_MINUTES', 60, 5),
      lookbackBars1m: parseIntEnv('CONTINUOUS_TRAINING_LOOKBACK_1M', 240, 60),
      lookaheadBars1m: parseIntEnv('CONTINUOUS_TRAINING_LOOKAHEAD_1M', 120, 10),
      stepBars: parseIntEnv('CONTINUOUS_TRAINING_STEP_BARS', 5, 1)
    },
    pollUrl: process.env.CONTINUOUS_TRAINING_POLL_URL,
    pollIntervalMs: parseIntEnv('CONTINUOUS_TRAINING_POLL_SECONDS', 60, 5) * 1000,
    pollApiKey: process.env.CONTINUOUS_TRAINING_POLL_API_KEY,
    pollApiKeyHeader: process.env.CONTINUOUS_TRAINING_POLL_API_KEY_HEADER
  };

  return {
    ...defaults,
    ...overrides,
    trainingOptions: {
      ...defaults.trainingOptions,
      ...(overrides.trainingOptions ?? {})
    }
  };
};

const resolveWebPushConfig = (overrides: Partial<WebPushNotificationConfig> = {}): WebPushNotificationConfig => {
  const defaults: WebPushNotificationConfig = {
    enabled: parseBooleanEnv('WEB_PUSH_ENABLED', true),
    subscriptionsPath: parseOptionalPathEnv(
      'WEB_PUSH_SUBSCRIPTIONS_PATH',
      path.resolve(process.cwd(), 'data', 'push', 'subscriptions.json')
    ),
    vapidKeysPath: parseOptionalPathEnv(
      'WEB_PUSH_VAPID_KEYS_PATH',
      path.resolve(process.cwd(), 'data', 'push', 'vapid-keys.json')
    ),
    vapidSubject: process.env.WEB_PUSH_VAPID_SUBJECT ?? 'https://167-172-252-171.sslip.io'
  };

  return {
    ...defaults,
    ...overrides
  };
};

const resolveNativePushConfig = (
  overrides: Partial<NativePushNotificationConfig> = {}
): NativePushNotificationConfig => {
  const privateKeyBase64 = process.env.APNS_PRIVATE_KEY_BASE64;
  const privateKeyPem =
    privateKeyBase64 && privateKeyBase64.trim().length > 0
      ? Buffer.from(privateKeyBase64, 'base64').toString('utf8')
      : process.env.APNS_PRIVATE_KEY_PEM;

  const defaults: NativePushNotificationConfig = {
    enabled: parseBooleanEnv('NATIVE_PUSH_ENABLED', true),
    devicesPath: parseOptionalPathEnv(
      'NATIVE_PUSH_DEVICES_PATH',
      path.resolve(process.cwd(), 'data', 'push', 'native-devices.json')
    ),
    teamId: process.env.APNS_TEAM_ID,
    keyId: process.env.APNS_KEY_ID,
    bundleId: process.env.APNS_BUNDLE_ID ?? 'com.tradingalgo.mobile',
    privateKeyPath: parseOptionalPathEnv('APNS_PRIVATE_KEY_PATH'),
    privateKeyPem,
    useSandbox: parseBooleanEnv('APNS_USE_SANDBOX', true)
  };

  return {
    ...defaults,
    ...overrides
  };
};

const resolveTelegramAlertConfig = (
  overrides: Partial<TelegramAlertConfig> = {}
): TelegramAlertConfig => {
  const defaults: TelegramAlertConfig = {
    enabled: parseBooleanEnv('TELEGRAM_ALERTS_ENABLED', false),
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    apiBaseUrl: process.env.TELEGRAM_API_BASE_URL ?? 'https://api.telegram.org',
    appUrl: process.env.TELEGRAM_APP_URL ?? 'https://167-172-252-171.sslip.io',
    nativeOpenerUrl:
      process.env.TELEGRAM_NATIVE_OPENER_URL ?? 'https://167-172-252-171.sslip.io/mobile/open-app.html?target=signals'
  };

  return {
    ...defaults,
    ...overrides
  };
};

const resolveSignalMonitorConfig = (
  overrides: Partial<SignalMonitorConfigInput> = {}
): SignalMonitorConfigInput => {
  const defaults: SignalMonitorConfigInput = {
    enabled: parseBooleanEnv('SIGNAL_MONITOR_ENABLED', true),
    timezone: process.env.SIGNAL_MONITOR_TIMEZONE ?? 'America/New_York',
    sessionStartHour: parseIntEnv('SIGNAL_MONITOR_SESSION_START_HOUR', 8, 0, 23),
    sessionStartMinute: parseIntEnv('SIGNAL_MONITOR_SESSION_START_MINUTE', 30, 0, 59),
    sessionEndHour: parseIntEnv('SIGNAL_MONITOR_SESSION_END_HOUR', 10, 0, 23),
    sessionEndMinute: parseIntEnv('SIGNAL_MONITOR_SESSION_END_MINUTE', 30, 0, 59),
    nyRangeMinutes: parseIntEnv('SIGNAL_MONITOR_NY_RANGE_MINUTES', 60, 5),
    lookbackBars1m: parseIntEnv('SIGNAL_MONITOR_LOOKBACK_1M', 240, 30),
    outcomeLookaheadBars1m: parseIntEnv('SIGNAL_MONITOR_OUTCOME_LOOKAHEAD_1M', 120, 30),
    bootstrapCsvDir: parseOptionalPathEnv(
      'SIGNAL_MONITOR_BOOTSTRAP_DIR',
      path.resolve(process.cwd(), 'data', 'historical', 'polygon-overnight', 'minute')
    ),
    bootstrapRecursive: parseBooleanEnv('SIGNAL_MONITOR_BOOTSTRAP_RECURSIVE', true),
    archivePath: parseOptionalPathEnv(
      'SIGNAL_MONITOR_ARCHIVE_PATH',
      path.resolve(process.cwd(), 'data', 'live', 'one-minute-bars.ndjson')
    ),
    maxBarsPerSymbol: parseIntEnv('SIGNAL_MONITOR_MAX_BARS_PER_SYMBOL', 30_000, 500),
    maxAlerts: parseIntEnv('SIGNAL_MONITOR_MAX_ALERTS', 100, 1),
    escalationCheckIntervalMs: parseIntEnv('SIGNAL_MONITOR_ESCALATION_CHECK_SECONDS', 30, 5) * 1000,
    escalationDelaysMs: [
      parseIntEnv('SIGNAL_MONITOR_ESCALATION_FIRST_SECONDS', 60, 15) * 1000,
      parseIntEnv('SIGNAL_MONITOR_ESCALATION_SECOND_SECONDS', 180, 30) * 1000
    ],
    minFinalScore: parseFloatEnv('SIGNAL_MONITOR_MIN_FINAL_SCORE', 74, 0, 100),
    accountSnapshot: {
      equity: parseFloatEnv('SIGNAL_MONITOR_ACCOUNT_EQUITY', 100_000, 1),
      dailyLossPct: parseFloatEnv('SIGNAL_MONITOR_DAILY_LOSS_PCT', 0, 0),
      sessionLossPct: parseFloatEnv('SIGNAL_MONITOR_SESSION_LOSS_PCT', 0, 0),
      consecutiveLosses: parseIntEnv('SIGNAL_MONITOR_CONSECUTIVE_LOSSES', 0, 0)
    },
    marketConditions: {
      spreadPoints: parseFloatEnv('SIGNAL_MONITOR_SPREAD_POINTS', 0.5, 0),
      expectedSlippagePoints: parseFloatEnv('SIGNAL_MONITOR_SLIPPAGE_POINTS', 0.5, 0)
    }
  };

  return {
    ...defaults,
    ...overrides,
    accountSnapshot: {
      ...defaults.accountSnapshot,
      ...(overrides.accountSnapshot ?? {})
    },
    marketConditions: {
      ...defaults.marketConditions,
      ...(overrides.marketConditions ?? {})
    }
  };
};

const resolveOperationalReminderConfig = (
  overrides: Partial<OperationalReminderConfig> = {}
): OperationalReminderConfig => {
  const appUrl = process.env.APP_BASE_URL ?? process.env.TELEGRAM_APP_URL ?? 'https://167-172-252-171.sslip.io';
  const ibkrMobileUrl =
    process.env.IBKR_MOBILE_ROUTING_URL ??
    DEFAULT_IBKR_LOGIN_URL;
  const ibkrConsoleUrl =
    process.env.IBKR_CONSOLE_URL ??
    process.env.IBKR_LOGIN_REMINDER_TARGET_URL ??
    DEFAULT_IBKR_CONSOLE_URL;
  const defaults: OperationalReminderConfig = {
    enabled: parseBooleanEnv('IBKR_LOGIN_REMINDER_ENABLED', false),
    timezone: process.env.IBKR_LOGIN_REMINDER_TIMEZONE ?? 'America/Chicago',
    sundayHour: parseIntEnv('IBKR_LOGIN_REMINDER_HOUR', 16, 0, 23),
    sundayMinute: parseIntEnv('IBKR_LOGIN_REMINDER_MINUTE', 30, 0, 59),
    checkIntervalMs: parseIntEnv('IBKR_LOGIN_REMINDER_CHECK_SECONDS', 60, 15) * 1000,
    statePath: parseOptionalPathEnv(
      'IBKR_LOGIN_REMINDER_STATE_PATH',
      path.resolve(process.cwd(), 'data', 'notifications', 'ibkr-login-reminder.json')
    ),
    appUrl,
    ibkrTargetUrl: ibkrConsoleUrl,
    ibkrMobileUrl
  };

  return {
    ...defaults,
    ...overrides
  };
};

const resolveMarketResearchConfig = (
  overrides: Partial<MarketResearchConfig> = {}
): MarketResearchConfigInput => {
  const knownSymbols = new Set<SymbolCode>(['NQ', 'ES']);
  const envSymbols = parseCsvEnv('MARKET_RESEARCH_SYMBOLS', ['NQ', 'ES'])
    .map((symbol) => symbol.toUpperCase() as SymbolCode)
    .filter((symbol) => knownSymbols.has(symbol));

  const defaults: MarketResearchConfigInput = {
    enabled: parseBooleanEnv('MARKET_RESEARCH_ENABLED', true),
    archivePath: parseOptionalPathEnv(
      'MARKET_RESEARCH_ARCHIVE_PATH',
      path.resolve(process.cwd(), 'data', 'live', 'one-minute-bars.ndjson')
    ),
    bootstrapCsvDir: parseOptionalPathEnv('MARKET_RESEARCH_BOOTSTRAP_DIR'),
    bootstrapRecursive: parseBooleanEnv('MARKET_RESEARCH_BOOTSTRAP_RECURSIVE', true),
    maxBarsPerSymbol: parseIntEnv('MARKET_RESEARCH_MAX_BARS_PER_SYMBOL', 6_000, 500),
    focusSymbols: envSymbols.length > 0 ? envSymbols : ['NQ', 'ES'],
    flipNotificationMinConfidence: parseFloatEnv('MARKET_RESEARCH_FLIP_NOTIFY_CONFIDENCE', 0.55, 0, 1),
    evaluationMinutes: parseIntEnv('MARKET_RESEARCH_EVALUATION_MINUTES', 60, 15, 240)
  };

  return {
    ...defaults,
    ...overrides,
    focusSymbols: overrides.focusSymbols ?? defaults.focusSymbols
  };
};

const resolveSignalReviewStorePath = (override?: string): string => {
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  const fromEnv = parseOptionalPathEnv(
    'SIGNAL_REVIEW_STORE_PATH',
    path.resolve(process.cwd(), 'data', 'reviews', 'signal-reviews.json')
  );

  return fromEnv ?? path.resolve(process.cwd(), 'data', 'reviews', 'signal-reviews.json');
};

const resolveSignalMonitorSettingsStorePath = (override?: string): string => {
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  const fromEnv = parseOptionalPathEnv(
    'SIGNAL_MONITOR_SETTINGS_STORE_PATH',
    path.resolve(process.cwd(), 'data', 'settings', 'signal-monitor.json')
  );

  return fromEnv ?? path.resolve(process.cwd(), 'data', 'settings', 'signal-monitor.json');
};

const resolveIbkrReconnectStateStorePath = (override?: string): string => {
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  const fromEnv = parseOptionalPathEnv(
    'IBKR_RECONNECT_STATE_STORE_PATH',
    path.resolve(process.cwd(), 'data', 'notifications', 'ibkr-reconnect-state.json')
  );

  return fromEnv ?? path.resolve(process.cwd(), 'data', 'notifications', 'ibkr-reconnect-state.json');
};

const resolveCalendarClient = (override?: EconomicCalendarClient): EconomicCalendarClient => {
  if (override) {
    return override;
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return new InMemoryEconomicCalendarClient();
  }

  const provider = (process.env.ECONOMIC_CALENDAR_PROVIDER ?? 'forexfactory').trim().toLowerCase();
  if (provider === 'memory' || provider === 'stub' || provider === 'inmemory') {
    return new InMemoryEconomicCalendarClient();
  }

  if (provider === 'forexfactory' || provider === 'ff') {
    return new ForexFactoryCalendarClient({
      exportUrl:
        process.env.FOREX_FACTORY_EXPORT_URL ??
        'https://nfs.faireconomy.media/ff_calendar_thisweek.json?version=918c104dd11c656d8e7462980fbf329c',
      lookbackHours: parseIntEnv('FOREX_FACTORY_LOOKBACK_HOURS', 6, 1, 48),
      lookaheadHours: parseIntEnv('FOREX_FACTORY_LOOKAHEAD_HOURS', 120, 1, 240),
      cacheTtlMs: parseIntEnv('FOREX_FACTORY_CACHE_TTL_SECONDS', 180, 30, 3600) * 1000,
      requestTimeoutMs: parseIntEnv('FOREX_FACTORY_TIMEOUT_MS', 10_000, 1_000, 60_000),
      maxEvents: parseIntEnv('FOREX_FACTORY_MAX_EVENTS', 200, 10, 500)
    });
  }

  if (provider === 'tradingeconomics' || provider === 'te') {
    return new TradingEconomicsCalendarClient({
      apiKey: process.env.TRADING_ECONOMICS_API_KEY ?? 'guest:guest',
      baseUrl: process.env.TRADING_ECONOMICS_BASE_URL ?? 'https://api.tradingeconomics.com',
      countries: parseCsvEnv('TRADING_ECONOMICS_COUNTRIES', ['All']),
      minImportance: parseIntEnv('TRADING_ECONOMICS_MIN_IMPORTANCE', 2, 1, 3) as 1 | 2 | 3,
      lookbackHours: parseIntEnv('TRADING_ECONOMICS_LOOKBACK_HOURS', 6, 1, 48),
      lookaheadHours: parseIntEnv('TRADING_ECONOMICS_LOOKAHEAD_HOURS', 72, 1, 168),
      cacheTtlMs: parseIntEnv('TRADING_ECONOMICS_CACHE_TTL_SECONDS', 180, 30, 3600) * 1000,
      requestTimeoutMs: parseIntEnv('TRADING_ECONOMICS_TIMEOUT_MS', 10_000, 1_000, 60_000),
      maxEvents: parseIntEnv('TRADING_ECONOMICS_MAX_EVENTS', 120, 10, 500)
    });
  }

  return new InMemoryEconomicCalendarClient();
};

export const buildApp = (options: BuildAppOptions = {}): AppContext => {
  const app = Fastify({ logger: false });

  const journalStore = options.journalStore ?? new JournalStore();
  const riskConfigStore = options.riskConfigStore ?? new RiskConfigStore();
  const signalMonitorSettingsStore =
    options.signalMonitorSettingsStore ??
    new SignalMonitorSettingsStore(resolveSignalMonitorSettingsStorePath(options.signalMonitorSettingsStorePath));
  const signalReviewStore =
    options.signalReviewStore ?? new SignalReviewStore(resolveSignalReviewStorePath(options.signalReviewStorePath));
  const ibkrReconnectStateStore =
    options.ibkrReconnectStateStore ??
    new IbkrReconnectStateStore(resolveIbkrReconnectStateStorePath(options.ibkrReconnectStateStorePath));
  const tradeLockerClient = options.tradeLockerClient ?? new InMemoryTradeLockerClient();
  const calendarClient = resolveCalendarClient(options.calendarClient);
  const rankingModelStore = options.rankingModelStore ?? new RankingModelStore(resolveInitialRankingModel(options.rankingModel));
  const executionService = new ExecutionService(journalStore, tradeLockerClient, () => riskConfigStore.get());
  const resolvedNativePushConfig = resolveNativePushConfig(options.nativePushConfig);
  const nativePushEnabled = options.nativePushEnabled ?? resolvedNativePushConfig.enabled;
  const nativePushNotificationService =
    options.nativePushNotificationService === undefined
      ? nativePushEnabled
        ? new NativePushNotificationService({
            ...resolvedNativePushConfig,
            enabled: true
          })
        : null
      : options.nativePushNotificationService;
  const resolvedTelegramAlertConfig = resolveTelegramAlertConfig(options.telegramAlertConfig);
  const telegramAlertEnabled = options.telegramAlertEnabled ?? resolvedTelegramAlertConfig.enabled;
  const telegramAlertService =
    options.telegramAlertService === undefined
      ? telegramAlertEnabled
        ? new TelegramAlertService({
            ...resolvedTelegramAlertConfig,
            enabled: true
          })
        : null
      : options.telegramAlertService;
  const resolvedWebPushConfig = resolveWebPushConfig(options.webPushConfig);
  const webPushEnabled = options.webPushEnabled ?? resolvedWebPushConfig.enabled;
  const webPushNotificationService =
    options.webPushNotificationService === undefined
      ? webPushEnabled
        ? new WebPushNotificationService({
            ...resolvedWebPushConfig,
            enabled: true
          })
        : null
      : options.webPushNotificationService;
  const tradeAssistAppNotifier: AppNotifier | null =
    nativePushNotificationService || webPushNotificationService
      ? {
          notifyGeneric: async (message: AppNotificationMessage) => {
            const deliveries = await Promise.allSettled([
              nativePushNotificationService?.notifyGeneric(message),
              webPushNotificationService?.notifyGeneric(message)
            ]);

            return deliveries.reduce(
              (summary, result) => {
                if (result.status !== 'fulfilled' || !result.value) {
                  return summary;
                }

                summary.attempted += result.value.attempted ?? 0;
                summary.delivered += result.value.delivered ?? 0;
                summary.removed += result.value.removed ?? 0;
                return summary;
              },
              { attempted: 0, delivered: 0, removed: 0 }
            );
          }
        }
      : null;
  const notifyTradeAssistChannels = async (
    appMessage: AppNotificationMessage,
    telegramMessage?: { title: string; lines?: string[]; buttons?: Array<{ text: string; url: string }> }
  ) => {
    const appDelivery = await tradeAssistAppNotifier?.notifyGeneric(appMessage);
    const telegramDelivery = telegramMessage ? await telegramAlertService?.notifyGeneric(telegramMessage) : undefined;
    return {
      appDelivery,
      telegramDelivery
    };
  };
  const ibkrMobileUrl =
    process.env.IBKR_MOBILE_ROUTING_URL ??
    DEFAULT_IBKR_LOGIN_URL;
  const ibkrStatusUrl = `${process.env.APP_BASE_URL ?? process.env.TELEGRAM_APP_URL ?? 'https://167-172-252-171.sslip.io'}/mobile/?tab=status&focus=ibkr-connection`;

  const syncRiskTradingWindowToSignalSettings = (): void => {
    const signalConfig = signalMonitorSettingsStore.get();
    riskConfigStore.patch({
      tradingWindow: {
        enabled: true,
        timezone: signalConfig.timezone,
        startHour: signalConfig.sessionStartHour,
        startMinute: signalConfig.sessionStartMinute,
        endHour: signalConfig.sessionEndHour,
        endMinute: signalConfig.sessionEndMinute
      }
    });
  };
  const trainingStatusUrl = `${process.env.APP_BASE_URL ?? process.env.TELEGRAM_APP_URL ?? 'https://167-172-252-171.sslip.io'}/mobile/?tab=status&focus=learning`;
  const ibkrReconnectFallbackDelayMs =
    parseIntEnv('IBKR_RECONNECT_FALLBACK_DELAY_SECONDS', 45, 5, 600) * 1000;
  const ibkrReconnectReminderIntervalMs =
    parseIntEnv('IBKR_RECONNECT_REMINDER_MINUTES', 60, 1, 240) * 60 * 1000;
  const ibkrReconnectReminderLabel = (() => {
    const totalMinutes = Math.round(ibkrReconnectReminderIntervalMs / (60 * 1000));
    if (totalMinutes % 60 === 0) {
      const hours = totalMinutes / 60;
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'}`;
  })();
  const ibkrAutoLoginEnabled = parseBooleanEnv('IBKR_AUTOLOGIN_ENABLED', false);
  const ibkrAutoLoginTimeoutMs = parseIntEnv('IBKR_AUTOLOGIN_TIMEOUT_MS', 60_000, 5_000, 180_000);
  const ibkrAutoLoginCooldownMs = parseIntEnv('IBKR_AUTOLOGIN_COOLDOWN_MS', 30_000, 1_000, 300_000);
  const ibkrAutoLoginScriptPath = path.resolve(
    process.cwd(),
    process.env.IBKR_AUTOLOGIN_SCRIPT_PATH ?? path.join('scripts', 'trigger-ibkr-login-vps.sh')
  );
  const ibkrResendPushScriptPath = path.resolve(
    process.cwd(),
    process.env.IBKR_RESEND_PUSH_SCRIPT_PATH ?? path.join('scripts', 'ibkr-resend-push-vps.sh')
  );
  const ibkrAutoLoginState = {
    lastAttemptAtMs: 0
  };
  const runIbkrScript = async (
    scriptPath: string,
    source: string,
    cooldownMs = 0,
    options: { ignoreCooldown?: boolean } = {}
  ): Promise<IbkrLoginTriggerResult> => {
    const now = Date.now();
    if (!options.ignoreCooldown && cooldownMs > 0 && now - ibkrAutoLoginState.lastAttemptAtMs < cooldownMs) {
      return {
        ok: false,
        skipped: true,
        reason: 'cooldown'
      };
    }

    if (cooldownMs > 0) {
      ibkrAutoLoginState.lastAttemptAtMs = now;
    }

    return await new Promise<IbkrLoginTriggerResult>((resolve) => {
      execFile(
        scriptPath,
        [source],
        {
          timeout: ibkrAutoLoginTimeoutMs,
          maxBuffer: 1024 * 1024
        },
        (error, stdout, stderr) => {
          if (error) {
            resolve({
              ok: false,
              reason: error.message,
              stdout,
              stderr
            });
            return;
          }

          resolve({
            ok: true,
            stdout,
            stderr
          });
        }
      );
    });
  };
  const runIbkrAutoLogin =
    options.ibkrLoginTrigger ??
    (async (
      source: string,
      loginOptions: { ignoreCooldown?: boolean } = {}
    ): Promise<IbkrLoginTriggerResult> => {
      if (!ibkrAutoLoginEnabled) {
        return {
          ok: false,
          skipped: true,
          reason: 'disabled'
        };
      }

      const now = Date.now();
      if (!loginOptions.ignoreCooldown && now - ibkrAutoLoginState.lastAttemptAtMs < ibkrAutoLoginCooldownMs) {
        return {
          ok: false,
          skipped: true,
          reason: 'cooldown'
        };
      }

      return await runIbkrScript(ibkrAutoLoginScriptPath, source, ibkrAutoLoginCooldownMs, loginOptions);
    });
  const runIbkrResendPush =
    options.ibkrResendPushTrigger ??
    (async (source: string): Promise<IbkrLoginTriggerResult> => await runIbkrScript(ibkrResendPushScriptPath, source));
  const canNotifyIbkrRecovery = (source: string): boolean =>
    shouldNotifyIbkrRecovery(source, new Date().toISOString(), riskConfigStore.get().tradingWindow);
  const compactIbkrRecoveryDetail = (value?: string): string | undefined => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return undefined;
    }

    return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
  };
  const describeIbkrLoginAttempt = (attempt: IbkrLoginTriggerResult): string => {
    if (attempt.ok) {
      return 'The server submitted the IB Gateway username/password.';
    }
    if (attempt.skipped) {
      if (attempt.reason === 'manual-resend-only') {
        return 'This fallback run did not resubmit the IB Gateway username/password.';
      }
      if (attempt.reason === 'cooldown') {
        return 'The server skipped the login retry because the recovery flow is cooling down.';
      }
      if (attempt.reason === 'disabled') {
        return 'The server skipped the login retry because IBKR auto-login is disabled.';
      }
      return 'The server skipped the IB Gateway login retry.';
    }

    const detail = compactIbkrRecoveryDetail(attempt.stderr || attempt.stdout || attempt.reason);
    return detail
      ? `The server could not resubmit the IB Gateway login automatically: ${detail}`
      : 'The server could not resubmit the IB Gateway login automatically.';
  };
  const describeIbkrResendAttempt = (attempt: IbkrLoginTriggerResult): string => {
    if (attempt.ok) {
      return 'The server ran the built-in broker fallback controls: resend notification, challenge/response, and QR code.';
    }
    if (attempt.skipped) {
      return 'The server skipped the broker fallback controls.';
    }

    const detail = compactIbkrRecoveryDetail(attempt.stderr || attempt.stdout || attempt.reason);
    return detail
      ? `The server could not run the broker fallback controls from the current auth screen: ${detail}`
      : 'The server could not run the broker fallback controls from the current auth screen.';
  };
  const buildIbkrRecoveryAttemptDetail = (
    loginAttempt: IbkrLoginTriggerResult,
    resendAttempt: IbkrLoginTriggerResult
  ): string => `${describeIbkrLoginAttempt(loginAttempt)} ${describeIbkrResendAttempt(resendAttempt)}`;
  const runIbkrRecoveryAttempt = async (
    source: string,
    recoveryOptions: { ignoreCooldown?: boolean } = {}
  ): Promise<{ loginAttempt: IbkrLoginTriggerResult; resendAttempt: IbkrLoginTriggerResult }> => {
    const loginAttempt = await runIbkrAutoLogin(source, recoveryOptions);
    const resendAttempt = await runIbkrResendPush(`${source}-push`);
    return {
      loginAttempt,
      resendAttempt
    };
  };
  const resolvedOperationalReminderConfig = resolveOperationalReminderConfig(options.operationalReminderConfig);
  const operationalReminderEnabled = options.operationalReminderEnabled ?? resolvedOperationalReminderConfig.enabled;
  const operationalReminderService =
    options.operationalReminderService === undefined
      ? operationalReminderEnabled
        ? new OperationalReminderService(
            {
              ...resolvedOperationalReminderConfig,
              enabled: true
            },
            tradeAssistAppNotifier,
            telegramAlertService,
            async (kind): Promise<void> => {
              const source = kind === 'test' ? 'reminder-test' : 'scheduled-reminder';
              await runIbkrRecoveryAttempt(source);
            }
          )
        : null
      : options.operationalReminderService;
  const resolvedMarketResearchConfig = resolveMarketResearchConfig(options.marketResearchConfig);
  const marketResearchEnabled = options.marketResearchEnabled ?? resolvedMarketResearchConfig.enabled;
  const marketResearchService =
    options.marketResearchService === undefined
      ? marketResearchEnabled
        ? new MarketResearchService({
            ...resolvedMarketResearchConfig,
            enabled: true,
            onTrendFlip: async (event) => {
              const directionLabel = event.nextTrend.direction === 'BULLISH' ? 'bullish' : 'bearish';
              const confidenceLabel = `${Math.round(event.nextTrend.confidence * 100)}%`;
              const leadSymbol = event.nextTrend.leadSymbol ?? 'NQ/ES';

              await notifyTradeAssistChannels(
                {
                  title: `Research trend flipped ${directionLabel}`,
                  body: `${leadSymbol} leading • ${confidenceLabel} confidence • ${event.nextTrend.reason}`,
                  url: '/mobile/?tab=home&focus=research-trend'
                },
                {
                  title: `Research trend flipped ${directionLabel}`,
                  lines: [
                    `Previous: ${event.previousDirection}`,
                    `Now: ${event.nextTrend.direction}`,
                    `Lead: ${leadSymbol}`,
                    `Confidence: ${confidenceLabel}`,
                    `Why: ${event.nextTrend.reason}`
                  ]
                }
              );
            }
          })
        : null
      : options.marketResearchService;
  const ibkrReconnectState: IbkrReconnectStateSnapshot & { pendingTimer?: NodeJS.Timeout } = {
    ...ibkrReconnectStateStore.get(),
    pendingTimer: undefined
  };
  const ibkrRecoveryHistoryLimit = 24;
  const persistIbkrReconnectState = async (): Promise<void> => {
    await ibkrReconnectStateStore.patch({
      lastConnectedAtMs: ibkrReconnectState.lastConnectedAtMs,
      lastLoginRequiredAtMs: ibkrReconnectState.lastLoginRequiredAtMs,
      lastFallbackAtMs: ibkrReconnectState.lastFallbackAtMs,
      lastSymbols: [...ibkrReconnectState.lastSymbols],
      lastSource: ibkrReconnectState.lastSource,
      history: ibkrReconnectState.history.map((entry) => ({
        ...entry,
        symbols: [...entry.symbols]
      }))
    });
  };
  const appendIbkrReconnectHistory = async (entry: IbkrReconnectHistoryEntry): Promise<void> => {
    ibkrReconnectState.history = [
      {
        ...entry,
        symbols: [...entry.symbols]
      },
      ...ibkrReconnectState.history.map((item) => ({
        ...item,
        symbols: [...item.symbols]
      }))
    ]
      .sort((left, right) => right.atMs - left.atMs)
      .slice(0, ibkrRecoveryHistoryLimit);
    await persistIbkrReconnectState();
  };
  const hasManualRecoveryActivitySince = (sinceAtMs: number): boolean =>
    ibkrReconnectState.history.some(
      (entry) =>
        entry.atMs >= sinceAtMs
        && (entry.kind === 'RECOVERY_REQUESTED' || entry.kind === 'RECOVERY_ATTEMPT')
        && (entry.source ?? '').trim().toLowerCase().startsWith('manual-')
    );
  const recordIbkrRecoveryAttempt = async (
    source: string,
    symbols: string[],
    loginAttempt: IbkrLoginTriggerResult,
    resendAttempt: IbkrLoginTriggerResult
  ): Promise<void> => {
    await appendIbkrReconnectHistory({
      kind: 'RECOVERY_ATTEMPT',
      atMs: Date.now(),
      source,
      symbols,
      detail: buildIbkrRecoveryAttemptDetail(loginAttempt, resendAttempt)
    });
  };
  const notifyIbkrRecoveryAttempt = async (
    title: string,
    source: string,
    symbols: string[],
    loginAttempt: IbkrLoginTriggerResult,
    resendAttempt: IbkrLoginTriggerResult
  ): Promise<void> => {
    if (!canNotifyIbkrRecovery(source)) {
      return;
    }

    const symbolText = symbols.length > 0 ? ` for ${symbols.join(', ')}` : '';
    const bodyText = `${title}${symbolText}. The server is actively trying to restore the IBKR session.`;
    await notifyTradeAssistChannels(
      {
        title,
        body: bodyText,
        url: ibkrStatusUrl,
        tag: 'ibkr-recovery-progress'
      },
      {
        title,
        lines: [
          bodyText,
          describeIbkrLoginAttempt(loginAttempt),
          describeIbkrResendAttempt(resendAttempt),
          'Approve the official IBKR push on your phone if IBKR asks for IB Key.',
          `Source: ${source}`,
          'You will get another message when the bridge reconnects.'
        ],
        buttons: [
          { text: 'Open Status', url: ibkrStatusUrl },
          { text: 'Last-Resort Website', url: ibkrMobileUrl }
        ]
      }
    );
  };
  const notifyIbkrRecoveryRequest = async (
    title: string,
    source: string,
    symbols: string[],
    detail: string
  ): Promise<void> => {
    if (!canNotifyIbkrRecovery(source)) {
      return;
    }

    const symbolText = symbols.length > 0 ? ` for ${symbols.join(', ')}` : '';
    const bodyText = `${title}${symbolText}. The server received your request and is starting the recovery flow now.`;
    await notifyTradeAssistChannels(
      {
        title,
        body: bodyText,
        url: ibkrStatusUrl,
        tag: 'ibkr-recovery-requested'
      },
      {
        title,
        lines: [
          bodyText,
          detail,
          `Source: ${source}`,
          'You will get another update when the server finishes the next recovery step.'
        ],
        buttons: [{ text: 'Open Status', url: ibkrStatusUrl }]
      }
    );
  };

  const sendIbkrReconnectFallback = async (
    requestedAtMs: number,
    symbols: string[],
    source: string
  ): Promise<void> => {
    if (ibkrReconnectState.lastConnectedAtMs >= requestedAtMs) {
      return;
    }
    if (ibkrReconnectState.lastFallbackAtMs >= requestedAtMs) {
      return;
    }

    const symbolText = symbols.length > 0 ? ` for ${symbols.join(', ')}` : '';
    const title = 'IBKR still not connected';
    const bodyText = `The server-side IBKR bridge still is not connected${symbolText}. The server is still waiting for IBKR approval.`;
    const { loginAttempt, resendAttempt } = await runIbkrRecoveryAttempt(`${source}-reminder`);
    const triggerLine = describeIbkrLoginAttempt(loginAttempt);
    const resendLine = describeIbkrResendAttempt(resendAttempt);
    const notifyUsers = canNotifyIbkrRecovery(source);

    if (notifyUsers) {
      await notifyTradeAssistChannels(
        {
          title,
          body: bodyText,
          url: ibkrStatusUrl,
          tag: 'ibkr-login-fallback'
        },
        {
          title,
          lines: [
            bodyText,
            triggerLine,
            resendLine,
            `Source: ${source}`,
            'Approve the official IBKR push on your phone if IBKR is still waiting there.'
          ],
          buttons: [
            { text: 'Open Status', url: ibkrStatusUrl },
            { text: 'Last-Resort Website', url: ibkrMobileUrl }
          ]
        }
      );
    }

    ibkrReconnectState.lastFallbackAtMs = Date.now();
    ibkrReconnectState.lastSource = source;
    ibkrReconnectState.lastSymbols = [...symbols];
    await appendIbkrReconnectHistory({
      kind: 'REMINDER',
      atMs: ibkrReconnectState.lastFallbackAtMs,
      source,
      symbols,
      detail: buildIbkrRecoveryAttemptDetail(loginAttempt, resendAttempt)
    });
    scheduleIbkrReconnectFallback(requestedAtMs, symbols, source, ibkrReconnectReminderIntervalMs);
  };

  const scheduleIbkrReconnectFallback = (
    requestedAtMs: number,
    symbols: string[],
    source: string,
    delayMs: number
  ): void => {
    if (ibkrReconnectState.pendingTimer) {
      clearTimeout(ibkrReconnectState.pendingTimer);
      ibkrReconnectState.pendingTimer = undefined;
    }

    ibkrReconnectState.pendingTimer = setTimeout(() => {
      void sendIbkrReconnectFallback(requestedAtMs, symbols, source);
    }, delayMs);
  };

  const resolvedContinuousConfig = resolveContinuousTrainingConfig(options.continuousTrainingConfig);
  const continuousTrainingEnabled = options.continuousTrainingEnabled ?? resolvedContinuousConfig.enabled;
  const continuousTrainingService =
    options.continuousTrainingService === undefined
      ? continuousTrainingEnabled
        ? new ContinuousTrainingService(rankingModelStore, {
            ...resolvedContinuousConfig,
            enabled: true,
            feedbackDatasetProvider: async () =>
              buildLearningFeedbackDataset(await signalReviewStore.listAllReviews()),
            onRunRecorded: async (run) => {
              if (!run.executed || run.trigger === 'startup') {
                return;
              }

              const improvementDelta = run.promotionDelta;
              const improved = typeof improvementDelta === 'number' && improvementDelta > 0;
              const title = improved ? 'Model improving' : 'Model retrained';
              const reason = run.promotionReason ?? 'LATEST_RETRAIN_LIVE';
              const modelId = run.activeModelId ?? run.modelId ?? 'unknown-model';

              await notifyTradeAssistChannels(
                {
                  title,
                  body: [
                    `Trigger ${run.trigger}`,
                    `Model ${modelId}`,
                    `Bars ${run.barCount.toLocaleString()} • Samples ${run.sampleCount.toLocaleString()}`,
                    `Delta ${formatWinRateDelta(improvementDelta)}`,
                    `Decision ${reason}`
                  ].join(' • '),
                  url: trainingStatusUrl,
                  tag: 'training-retrain'
                },
                {
                  title,
                  lines: [
                    `Trigger: ${run.trigger}`,
                    `Live model: ${modelId}`,
                    `Bars: ${run.barCount.toLocaleString()} • Samples: ${run.sampleCount.toLocaleString()}`,
                    `Delta vs prior model: ${formatWinRateDelta(improvementDelta)}`,
                    `Promotion decision: ${reason}`
                  ],
                  buttons: [{ text: 'Open Status', url: trainingStatusUrl }]
                }
              );
            }
          })
        : null
      : options.continuousTrainingService;

  const resolvedSignalMonitorConfig = resolveSignalMonitorConfig(options.signalMonitorConfig);
  signalMonitorSettingsStore.seed({
    timezone: resolvedSignalMonitorConfig.timezone,
    sessionStartHour: resolvedSignalMonitorConfig.sessionStartHour,
    sessionStartMinute: resolvedSignalMonitorConfig.sessionStartMinute,
    sessionEndHour: resolvedSignalMonitorConfig.sessionEndHour,
    sessionEndMinute: resolvedSignalMonitorConfig.sessionEndMinute,
    nyRangeMinutes: resolvedSignalMonitorConfig.nyRangeMinutes,
    minFinalScore: resolvedSignalMonitorConfig.minFinalScore
  });
  const signalMonitorEnabled = options.signalMonitorEnabled ?? resolvedSignalMonitorConfig.enabled;
  const signalMonitorService =
    options.signalMonitorService === undefined
      ? signalMonitorEnabled
        ? new SignalMonitorService(
            rankingModelStore,
            journalStore,
            calendarClient,
            executionService,
            () => riskConfigStore.get(),
            {
              ...resolvedSignalMonitorConfig,
              enabled: true
            },
            () => signalMonitorSettingsStore.get(),
            () => marketResearchService?.status() ?? null,
            signalReviewStore,
            nativePushNotificationService,
            webPushNotificationService,
            telegramAlertService
          )
        : null
      : options.signalMonitorService;

  if (nativePushNotificationService) {
    void nativePushNotificationService.start();
  }

  if (webPushNotificationService) {
    void webPushNotificationService.start();
  }

  void signalMonitorSettingsStore
    .start()
    .then(() => {
      syncRiskTradingWindowToSignalSettings();
    })
    .catch(() => undefined);
  void signalReviewStore.start();

  app.addHook('onReady', async () => {
    await ibkrReconnectStateStore.start();
    const persistedState = ibkrReconnectStateStore.get();
    ibkrReconnectState.lastConnectedAtMs = persistedState.lastConnectedAtMs;
    ibkrReconnectState.lastLoginRequiredAtMs = persistedState.lastLoginRequiredAtMs;
    ibkrReconnectState.lastFallbackAtMs = persistedState.lastFallbackAtMs;
    ibkrReconnectState.lastSource = persistedState.lastSource;
    ibkrReconnectState.lastSymbols = [...persistedState.lastSymbols];
    ibkrReconnectState.history = persistedState.history.map((entry) => ({
      ...entry,
      symbols: [...entry.symbols]
    }));

    if (ibkrReconnectState.history.length === 0) {
      const recoveredSymbols = [...ibkrReconnectState.lastSymbols];
      const recoveredSource = ibkrReconnectState.lastSource ?? 'ibkr-bridge';
      const backfilledHistory: IbkrReconnectHistoryEntry[] = [];

      if (ibkrReconnectState.lastLoginRequiredAtMs > 0) {
        backfilledHistory.push({
          kind: 'LOGIN_REQUIRED',
          atMs: ibkrReconnectState.lastLoginRequiredAtMs,
          source: recoveredSource,
          symbols: recoveredSymbols,
          detail: 'Recovered from persisted reconnect state.'
        });
      }

      if (ibkrReconnectState.lastFallbackAtMs > 0) {
        backfilledHistory.push({
          kind: 'REMINDER',
          atMs: ibkrReconnectState.lastFallbackAtMs,
          source: recoveredSource,
          symbols: recoveredSymbols,
          detail: 'Recovered from persisted reconnect state.'
        });
      }

      if (ibkrReconnectState.lastConnectedAtMs > 0) {
        backfilledHistory.push({
          kind: 'CONNECTED',
          atMs: ibkrReconnectState.lastConnectedAtMs,
          source: recoveredSource,
          symbols: recoveredSymbols,
          detail: 'Recovered from persisted reconnect state.'
        });
      }

      if (backfilledHistory.length > 0) {
        ibkrReconnectState.history = backfilledHistory
          .sort((left, right) => right.atMs - left.atMs)
          .slice(0, ibkrRecoveryHistoryLimit);
        await persistIbkrReconnectState();
      }
    }

    if (
      ibkrReconnectState.lastLoginRequiredAtMs > ibkrReconnectState.lastConnectedAtMs
      && !ibkrReconnectState.pendingTimer
    ) {
      const baseTimestamp =
        ibkrReconnectState.lastFallbackAtMs >= ibkrReconnectState.lastLoginRequiredAtMs
          ? ibkrReconnectState.lastFallbackAtMs
          : ibkrReconnectState.lastLoginRequiredAtMs;
      const cadenceMs =
        ibkrReconnectState.lastFallbackAtMs >= ibkrReconnectState.lastLoginRequiredAtMs
          ? ibkrReconnectReminderIntervalMs
          : ibkrReconnectFallbackDelayMs;
      const elapsedMs = Math.max(0, Date.now() - baseTimestamp);
      const delayMs = Math.max(5_000, cadenceMs - elapsedMs);

      scheduleIbkrReconnectFallback(
        ibkrReconnectState.lastLoginRequiredAtMs,
        [...ibkrReconnectState.lastSymbols],
        ibkrReconnectState.lastSource ?? 'ibkr-bridge',
        delayMs
      );
    }
  });

  if (continuousTrainingService) {
    void continuousTrainingService.start();
    app.addHook('onClose', async () => {
      continuousTrainingService.stop();
    });
  }

  if (signalMonitorService) {
    void signalMonitorService.start();
    app.addHook('onClose', async () => {
      signalMonitorService.stop();
    });
  }

  if (marketResearchService) {
    void marketResearchService.start();
    app.addHook('onClose', async () => {
      marketResearchService.stop();
    });
  }

  if (operationalReminderService) {
    void operationalReminderService.start();
    app.addHook('onClose', async () => {
      operationalReminderService.stop();
    });
  }

  app.addHook('onClose', async () => {
    if (ibkrReconnectState.pendingTimer) {
      clearTimeout(ibkrReconnectState.pendingTimer);
      ibkrReconnectState.pendingTimer = undefined;
    }
  });

  const buildCompactAiContext = async () => {
    const monitor = signalMonitorService ? signalMonitorService.status() : { enabled: false, started: false };
    const monitorLatestBarTimestamp =
      'latestBarTimestampBySymbol' in monitor
        ? Object.values(monitor.latestBarTimestampBySymbol ?? {})
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1)
        : undefined;
    const training = continuousTrainingService?.status() ?? { enabled: false, started: false };
    const trainingLatestBarTimestamp =
      'latestBarTimestamp' in training && typeof training.latestBarTimestamp === 'string'
        ? training.latestBarTimestamp
        : undefined;
    const latestBarTimestamp = [monitorLatestBarTimestamp, trainingLatestBarTimestamp]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const recentArchiveBars = await readRecentArchiveBars(resolvedContinuousConfig.liveArchivePath);
    const frozenFeed = detectFrozenArchiveFeed(
      recentArchiveBars,
      Object.keys(('latestBarTimestampBySymbol' in monitor ? monitor.latestBarTimestampBySymbol ?? {} : {}) || {}),
      latestBarTimestamp
    );
    const liveFeed = classifyLiveFeedStatus(
      Boolean('started' in monitor && monitor.started),
      latestBarTimestamp,
      frozenFeed
    );
    const allReviews = await signalReviewStore.listAllReviews();
    const learningPerformance = summarizeLearningPerformance(allReviews);
    const research = marketResearchService ? marketResearchService.status() : null;
    const lastAlert = signalMonitorService?.listAlerts(1)[0];
    const calendarEvents = (await calendarClient.listUpcomingEvents())
      .filter((event) => Date.parse(event.startsAt) >= Date.now() - 5 * 60 * 1000)
      .slice(0, 3);
    const calendarStatus = calendarClient.status();
    const topSetup = learningPerformance.bySetup[0];
    const topResearchAlignment = learningPerformance.byResearchAlignment[0];

    return {
      generatedAt: new Date().toISOString(),
      desk: {
        feedStatus: liveFeed.status,
        marketSessionState: liveFeed.sessionState,
        latestBarTimestamp,
        rankingModelId: rankingModelStore.get().modelId,
        retrainCadenceMinutes: Math.round(resolvedContinuousConfig.retrainIntervalMs / 60_000)
      },
      research: research
        ? {
            direction: research.overallTrend.direction,
            confidence: Number(research.overallTrend.confidence.toFixed(2)),
            leadSymbol: research.overallTrend.leadSymbol,
            reason: compactText(research.overallTrend.reason, 160),
            hitRate: Number(research.performance.hitRate.toFixed(3)),
            evaluatedPredictions: research.performance.evaluatedPredictions,
            openPredictions: research.performance.openPredictions
          }
        : null,
      learning: {
        resolvedReviews: learningPerformance.resolvedReviews,
        pendingOutcomeReviews: learningPerformance.pendingOutcomeReviews,
        winRate: Number(learningPerformance.winRate.toFixed(3)),
        topSetup: topSetup
          ? {
              setupType: topSetup.key,
              winRate: Number(topSetup.winRate.toFixed(3)),
              sampleSize: topSetup.total
            }
          : null,
        researchAlignmentEdge: topResearchAlignment
          ? {
              label: topResearchAlignment.label,
              winRate: Number(topResearchAlignment.winRate.toFixed(3)),
              sampleSize: topResearchAlignment.total
            }
          : null,
        preferredSetups: learningPerformance.preference.preferredSetups.slice(0, 3),
        preferredSymbols: learningPerformance.preference.preferredSymbols.slice(0, 3)
      },
      macro: {
        source: calendarStatus.sourceName,
        mode: calendarStatus.mode,
        nextEvents: calendarEvents.map((event) => ({
          startsAt: event.startsAt,
          title: compactText(event.title ?? event.category ?? `${event.currency} macro event`, 80),
          impact: event.impact,
          currency: event.currency
        }))
      },
      ibkr: {
        pendingReconnect: ibkrReconnectState.lastLoginRequiredAtMs > ibkrReconnectState.lastConnectedAtMs,
        lastLoginRequiredAt:
          ibkrReconnectState.lastLoginRequiredAtMs > 0 ? new Date(ibkrReconnectState.lastLoginRequiredAtMs).toISOString() : undefined,
        lastConnectedAt:
          ibkrReconnectState.lastConnectedAtMs > 0 ? new Date(ibkrReconnectState.lastConnectedAtMs).toISOString() : undefined
      },
      lastAlert: lastAlert
        ? {
            symbol: lastAlert.symbol,
            side: lastAlert.side,
            setupType: lastAlert.setupType,
            detectedAt: lastAlert.detectedAt,
            finalScore:
              typeof lastAlert.candidate.finalScore === 'number'
                ? Number(lastAlert.candidate.finalScore.toFixed(2))
                : null,
            researchAligned:
              typeof lastAlert.candidate.metadata?.researchTrendAligned === 'boolean'
                ? lastAlert.candidate.metadata.researchTrendAligned
                : null
          }
        : null
    };
  };

  const buildDeskBrief = async () => {
    const context = await buildCompactAiContext();
    const nextMacroEvent = context.macro.nextEvents[0] ?? null;
    const nextMacroStartsAtMs = nextMacroEvent ? Date.parse(nextMacroEvent.startsAt) : Number.NaN;
    const minutesToMacro = Number.isFinite(nextMacroStartsAtMs)
      ? Math.round((nextMacroStartsAtMs - Date.now()) / 60_000)
      : null;
    const macroIsNear =
      nextMacroEvent
      && nextMacroEvent.impact === 'high'
      && typeof minutesToMacro === 'number'
      && minutesToMacro >= -5
      && minutesToMacro <= 45;

    let tone: 'neutral' | 'bullish' | 'bearish' | 'risk' = 'neutral';
    let headline = 'Wait for a clean 5m setup.';
    let summary = 'The desk does not have enough aligned evidence to press directional risk yet.';

    if (context.ibkr.pendingReconnect) {
      tone = 'risk';
      headline = 'Restore IBKR before trusting the board.';
      summary = 'The broker session still needs recovery, so live setup decisions should be treated as incomplete.';
    } else if (context.desk.feedStatus !== 'LIVE') {
      tone = 'risk';
      headline = `Treat the feed as ${context.desk.feedStatus.toLowerCase()}.`;
      summary = 'The desk is connected, but the live tape quality is not strong enough to lean hard on new signals.';
    } else if (macroIsNear) {
      tone = 'risk';
      headline = `Stand aside into ${nextMacroEvent.title ?? 'the next macro event'}.`;
      summary = 'A high-impact macro catalyst is close enough to break otherwise clean intraday structure.';
    } else if (context.research?.direction === 'BULLISH' && (context.research.confidence ?? 0) >= 0.55) {
      tone = 'bullish';
      headline = `Lean bullish with ${context.research.leadSymbol ?? 'NQ/ES'} leading.`;
      summary = context.research.reason ?? 'Autonomous research is aligned on the long side.';
    } else if (context.research?.direction === 'BEARISH' && (context.research.confidence ?? 0) >= 0.55) {
      tone = 'bearish';
      headline = `Lean bearish with ${context.research.leadSymbol ?? 'NQ/ES'} leading.`;
      summary = context.research.reason ?? 'Autonomous research is aligned on the short side.';
    } else if (context.lastAlert) {
      tone = context.lastAlert.side === 'LONG' ? 'bullish' : 'bearish';
      headline = `Focus on ${context.lastAlert.symbol} ${context.lastAlert.side} if structure still holds.`;
      summary = `${context.lastAlert.setupType} is the most recent qualified idea on the 5m board.`;
    }

    const actions = [
      context.ibkr.pendingReconnect
        ? 'Run full recovery in the app and wait for IBKR connected.'
        : context.desk.feedStatus === 'LIVE'
          ? 'Use the 5m board first and only confirm clean setups.'
          : 'Do not trust fresh entries until the live feed returns to LIVE.',
      context.lastAlert
        ? `Check ${context.lastAlert.symbol} ${context.lastAlert.side} against TradingView before acting.`
        : 'Let the board print a fresh 5m idea before forcing a trade.',
      macroIsNear && nextMacroEvent
        ? `Respect the ${nextMacroEvent.title} window before pressing size.`
        : nextMacroEvent
          ? `Keep ${nextMacroEvent.title} on deck as the next macro catalyst.`
          : 'No immediate macro catalyst is close enough to override structure.'
    ].slice(0, 3);

    const reasons = [
      `Feed ${context.desk.feedStatus} • session ${context.desk.marketSessionState.toLowerCase()}.`,
      context.research
        ? `Research ${context.research.direction.toLowerCase()} at ${Math.round((context.research.confidence ?? 0) * 100)}% confidence.`
        : 'Research trend is not available yet.',
      context.learning.topSetup
        ? `Best learned setup is ${context.learning.topSetup.setupType} at ${Math.round(context.learning.topSetup.winRate * 100)}% over ${context.learning.topSetup.sampleSize} reviews.`
        : 'Learning does not have a clear top setup yet.'
    ].slice(0, 3);

    const watch = [
      context.lastAlert ? `${context.lastAlert.symbol} ${context.lastAlert.side}` : null,
      context.research?.leadSymbol ? `Research lead ${context.research.leadSymbol}` : null,
      nextMacroEvent
        ? `${nextMacroEvent.currency} ${nextMacroEvent.title ?? 'macro'}${typeof minutesToMacro === 'number' ? ` in ${minutesToMacro}m` : ''}`
        : null
    ].filter((value): value is string => Boolean(value)).slice(0, 3);

    return {
      brief: {
        generatedAt: context.generatedAt,
        tone,
        headline,
        summary,
        actions,
        reasons,
        watch,
        context
      }
    };
  };

  const buildHomeDeck = async () => {
    const deskBrief = await buildDeskBrief();
    const context = deskBrief.brief.context;
    const monitor = signalMonitorService ? signalMonitorService.status() : { enabled: false, started: false };
    const latestBarTimestampBySymbol =
      'latestBarTimestampBySymbol' in monitor ? monitor.latestBarTimestampBySymbol ?? {} : {};
    const alerts = signalMonitorService?.listAlerts(20) ?? [];
    const readyCount = alerts.filter((alert) => alert.riskDecision.allowed).length;
    const reviewSummary = await signalReviewStore.summary();
    const training = continuousTrainingService?.status() ?? { enabled: false, started: false };
    const research = marketResearchService?.status() ?? null;
    const signalConfig = signalMonitorSettingsStore.get();
    const watchlist = signalConfig.enabledSymbols.slice(0, 2).map((symbol) => {
      const symbolResearch = research?.symbols?.find((entry) => entry.symbol === symbol);
      const latestAlert = alerts.find((alert) => alert.symbol === symbol) ?? null;
      return {
        symbol,
        latestPrice: symbolResearch?.latestPrice ?? null,
        latestBarTimestamp: symbolResearch?.latestBarTimestamp ?? latestBarTimestampBySymbol[symbol],
        researchDirection: symbolResearch?.direction ?? context.research?.direction ?? 'BALANCED',
        researchConfidence:
          typeof symbolResearch?.confidence === 'number' ? Number(symbolResearch.confidence.toFixed(2)) : null,
        researchReason: compactText(symbolResearch?.reason ?? context.research?.reason, 120),
        lead: context.research?.leadSymbol === symbol,
        latestAlert: latestAlert
          ? {
              side: latestAlert.side,
              setupType: latestAlert.setupType,
              detectedAt: latestAlert.detectedAt,
              finalScore:
                typeof latestAlert.candidate.finalScore === 'number'
                  ? Number(latestAlert.candidate.finalScore.toFixed(1))
                  : null,
              allowed: latestAlert.riskDecision.allowed
            }
          : null
      };
    });

    return {
      deck: {
        generatedAt: context.generatedAt,
        tone: deskBrief.brief.tone,
        headline: deskBrief.brief.headline,
        summary: deskBrief.brief.summary,
        signalCount: alerts.length,
        readyCount,
        blockedCount: Math.max(0, alerts.length - readyCount),
        reviewPending: reviewSummary.pending,
        modelId: context.desk.rankingModelId,
        lastRetrainedAt:
          'lastRun' in training && typeof training.lastRun?.trainedAt === 'string'
            ? training.lastRun.trainedAt
            : 'lastTrainedAt' in training && typeof training.lastTrainedAt === 'string'
              ? training.lastTrainedAt
              : undefined,
        watchlist
      }
    };
  };

  const mobileRoot = path.resolve(process.cwd(), 'public', 'mobile');

  app.register(fastifyStatic, {
    root: mobileRoot,
    prefix: '/mobile/'
  });

  app.get('/mobile', async (_request, reply) => reply.redirect('/mobile/'));

  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      ok: true,
      service: 'trading-algorithm-v1',
      timestamp: new Date().toISOString()
    });
  });

  app.post('/signals/generate', async (request, reply) => {
    try {
      const body = parseOrThrow(signalGenerateBodySchema.safeParse(request.body));
      const candidates = generateSetupCandidates(body);

      journalStore.addEvent({
        type: 'SIGNAL_GENERATED',
        timestamp: body.now,
        symbol: body.symbol,
        payload: {
          candidateCount: candidates.length,
          setupTypes: candidates.map((candidate) => candidate.setupType)
        }
      });

      return reply.status(200).send({ candidates });
    } catch (error) {
      return reply.status(400).send({ message: 'Invalid signal generation request', error });
    }
  });

  app.post('/signals/rank', async (request, reply) => {
    try {
      const body = parseOrThrow(signalRankBodySchema.safeParse(request.body));
      const activeModel = rankingModelStore.get();
      const ranked = rankCandidates({ candidates: body.candidates }, activeModel);

      journalStore.addEvent({
        type: 'SIGNAL_RANKED',
        timestamp: new Date().toISOString(),
        payload: {
          rankedCount: ranked.length,
          topCandidateId: ranked[0]?.id,
          rankingModelId: activeModel.modelId
        }
      });

      return reply.status(200).send({ candidates: ranked, rankingModelId: activeModel.modelId });
    } catch (error) {
      return reply.status(400).send({ message: 'Invalid signal rank request', error });
    }
  });

  app.get('/signals/alerts', async (request, reply) => {
    const limitRaw = (request.query as { limit?: string } | undefined)?.limit;
    const parsedLimit = Number.parseInt(limitRaw ?? '30', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 30;
    const alerts = signalMonitorService ? signalMonitorService.listAlerts(limit) : [];
    const enrichedAlerts = await Promise.all(
      alerts.map(async (alert) => {
        const review = await signalReviewStore.getReview(alert.alertId);
        return {
          ...alert,
          reviewState: review
            ? {
                reviewStatus: review.reviewStatus,
                acknowledgedAt: review.acknowledgedAt,
                acknowledgedBy: review.acknowledgedBy,
                escalationCount: review.escalationCount ?? 0,
                lastEscalatedAt: review.lastEscalatedAt,
                reviewedAt: review.reviewedAt,
                validity: review.validity,
                outcome: review.outcome
              }
            : alert.reviewState
        };
      })
    );

    return reply.status(200).send({
      alerts: enrichedAlerts
    });
  });

  app.post('/signals/alerts/:alertId/ack', async (request, reply) => {
    try {
      const alertId = (request.params as { alertId?: string } | undefined)?.alertId;
      if (!alertId) {
        return reply.status(400).send({ message: 'Alert id is required' });
      }

      const body = parseOrThrow(signalAlertAcknowledgeBodySchema.safeParse(request.body ?? {}));
      const review = await signalReviewStore.acknowledgeAlert(alertId, body.acknowledgedBy, body.acknowledgedAt);
      const summary = await signalReviewStore.summary();

      return reply.status(200).send({
        ok: true,
        review,
        summary
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/signals/reviews', async (request, reply) => {
    const query = (request.query as { status?: string; limit?: string } | undefined) ?? {};
    const normalizedStatus = (query.status ?? 'ALL').toUpperCase();
    const parsedStatus = normalizedStatus === 'ALL' ? { success: true as const, data: 'ALL' as const } : signalReviewStatusSchema.safeParse(normalizedStatus);
    const status = parsedStatus.success ? parsedStatus.data : null;
    if (!status) {
      return reply.status(400).send({
        message: 'Invalid review status filter'
      });
    }

    const parsedLimit = Number.parseInt(query.limit ?? '40', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 40;
    const [reviews, summary] = await Promise.all([
      signalReviewStore.listReviews(status as 'ALL' | 'PENDING' | 'COMPLETED', limit),
      signalReviewStore.summary()
    ]);

    return reply.status(200).send({
      reviews,
      summary
    });
  });

  app.post('/signals/replay-history', async (request, reply) => {
    if (!signalMonitorService) {
      return reply.status(409).send({
        message: 'Signal monitor is disabled'
      });
    }

    const body = (request.body as {
      since?: string;
      until?: string;
      publishAlerts?: boolean;
      notifyChannels?: boolean;
      maxAlerts?: number;
    } | undefined) ?? {};

    const normalizedMaxAlerts =
      typeof body.maxAlerts === 'number' && Number.isFinite(body.maxAlerts) && body.maxAlerts > 0
        ? Math.floor(body.maxAlerts)
        : undefined;

    try {
      const replay = await signalMonitorService.replayHistoricalAlerts({
        since: typeof body.since === 'string' && body.since.trim().length > 0 ? body.since : undefined,
        until: typeof body.until === 'string' && body.until.trim().length > 0 ? body.until : undefined,
        publishAlerts: body.publishAlerts ?? true,
        notifyChannels: body.notifyChannels ?? true,
        maxAlerts: normalizedMaxAlerts
      });

      return reply.status(200).send({
        ok: true,
        replay,
        monitor: signalMonitorService.status()
      });
    } catch (error) {
      return reply.status(400).send({
        message: (error as Error).message
      });
    }
  });

  app.get('/learning/performance', async (_request, reply) => {
    const reviews = await signalReviewStore.listAllReviews();
    const performance = summarizeLearningPerformance(reviews);
    const feedback = buildLearningFeedbackDataset(reviews);

    return reply.status(200).send({
      performance,
      feedback: feedback.counts
    });
  });

  app.post('/signals/reviews', async (request, reply) => {
    try {
      const body = parseOrThrow(signalReviewUpsertBodySchema.safeParse(request.body));
      const review = await signalReviewStore.upsertReview(body);
      const summary = await signalReviewStore.summary();

      journalStore.addEvent({
        type: 'SIGNAL_REVIEWED',
        timestamp: review.reviewedAt ?? review.updatedAt,
        candidateId: review.candidateId,
        symbol: review.symbol,
        payload: {
          alertId: review.alertId,
          reviewId: review.reviewId,
          reviewStatus: review.reviewStatus,
          validity: review.validity ?? null,
          outcome: review.outcome ?? null,
          reviewedBy: review.reviewedBy ?? null,
          notesPresent: Boolean(review.notes)
        }
      });

      return reply.status(200).send({
        review,
        summary
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/signals/config', async (_request, reply) => {
    return reply.status(200).send({
      config: signalMonitorSettingsStore.get()
    });
  });

  app.patch('/signals/config', async (request, reply) => {
    try {
      const body = parseOrThrow(signalMonitorSettingsPatchSchema.safeParse(request.body));
      const config = await signalMonitorSettingsStore.patch(body);
      syncRiskTradingWindowToSignalSettings();
      return reply.status(200).send({ config });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/diagnostics', async (_request, reply) => {
    const monitor = signalMonitorService ? signalMonitorService.status() : { enabled: false, started: false };
    const monitorLatestBarTimestamp =
      'latestBarTimestampBySymbol' in monitor
        ? Object.values(monitor.latestBarTimestampBySymbol ?? {})
            .filter((value): value is string => Boolean(value))
            .sort()
            .at(-1)
        : undefined;
    const lastAlert = signalMonitorService?.listAlerts(1)[0];
    const webPush = webPushNotificationService?.status() ?? { enabled: false, ready: false, subscriberCount: 0 };
    const nativePush =
      nativePushNotificationService?.status() ?? { enabled: false, ready: false, deviceCount: 0, environment: 'sandbox' };
    const telegram = telegramAlertService?.status() ?? { enabled: false, ready: false, chatConfigured: false };
    const operationalReminder =
      operationalReminderService?.status() ??
      ({
        enabled: false,
        started: false,
        timezone: 'America/Chicago',
        sundayTime: '16:30'
      } satisfies OperationalReminderStatus);
    const calendarEvents = await calendarClient.listUpcomingEvents();
    const calendarStatus = calendarClient.status();
    const upcomingCalendarEvents = calendarEvents
      .filter((event) => Date.parse(event.startsAt) >= Date.now() - 5 * 60 * 1000)
      .slice(0, 8);
    const reviews = await signalReviewStore.summary();
    const allReviews = await signalReviewStore.listAllReviews();
    const learningPerformance = summarizeLearningPerformance(allReviews);
    const signalConfig = signalMonitorSettingsStore.get();
    const training = continuousTrainingService?.status() ?? { enabled: false, started: false };
    const research: MarketResearchStatus | { enabled: false; started: false } = marketResearchService
      ? marketResearchService.status()
      : { enabled: false, started: false };
    const trainingLatestBarTimestamp =
      'latestBarTimestamp' in training && typeof training.latestBarTimestamp === 'string'
        ? training.latestBarTimestamp
        : undefined;
    const latestBarTimestamp = [monitorLatestBarTimestamp, trainingLatestBarTimestamp]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const ibkrRecovery = {
      autoLoginEnabled: ibkrAutoLoginEnabled,
      pendingReconnect: ibkrReconnectState.lastLoginRequiredAtMs > ibkrReconnectState.lastConnectedAtMs,
      lastLoginRequiredAt:
        ibkrReconnectState.lastLoginRequiredAtMs > 0 ? new Date(ibkrReconnectState.lastLoginRequiredAtMs).toISOString() : undefined,
      lastConnectedAt:
        ibkrReconnectState.lastConnectedAtMs > 0 ? new Date(ibkrReconnectState.lastConnectedAtMs).toISOString() : undefined,
      lastReminderAt:
        ibkrReconnectState.lastFallbackAtMs > 0 ? new Date(ibkrReconnectState.lastFallbackAtMs).toISOString() : undefined,
      lastResortWebsiteUrl: ibkrMobileUrl,
      websiteFallbackUrl: ibkrMobileUrl,
      history: ibkrReconnectState.history.map((entry) => ({
        kind: entry.kind,
        at: new Date(entry.atMs).toISOString(),
        source: entry.source,
        symbols: [...entry.symbols],
        detail: entry.detail
      }))
    };
    const recentArchiveBars = await readRecentArchiveBars(resolvedContinuousConfig.liveArchivePath);
    const frozenFeed = detectFrozenArchiveFeed(
      recentArchiveBars,
      Object.keys(('latestBarTimestampBySymbol' in monitor ? monitor.latestBarTimestampBySymbol ?? {} : {}) || {}),
      latestBarTimestamp
    );
    const liveFeed = classifyLiveFeedStatus(
      Boolean('started' in monitor && monitor.started),
      latestBarTimestamp,
      frozenFeed
    );

    return reply.status(200).send({
      diagnostics: {
        liveFeedStatus: liveFeed.status,
        liveFeedBarAgeMs: liveFeed.barAgeMs,
        marketSessionState: liveFeed.sessionState,
        latestBarTimestamp,
        signalMonitorLatestBarTimestamp: monitorLatestBarTimestamp,
        trainingLatestBarTimestamp,
        lastAlertAt: 'lastAlertAt' in monitor ? monitor.lastAlertAt : undefined,
        signalMonitor: monitor,
        rankingModel: {
          loaded: true,
          modelId: rankingModelStore.get().modelId
        },
        notifications: {
          webPushSubscribers: webPush.subscriberCount,
          nativePushDevices: nativePush.deviceCount,
          nativePushReady: nativePush.ready,
          nativePushReadyReason: nativePush.readyReason,
          nativePushMissingConfigFields: nativePush.missingConfigFields ?? [],
          telegramReady: telegram.ready,
          ibkrLoginReminderEnabled: operationalReminder.enabled,
          ibkrLoginReminderStarted: operationalReminder.started
        },
        calendar: {
          ...calendarStatus,
          upcomingEvents: upcomingCalendarEvents
        },
        ibkrRecovery,
        operationalReminder,
        training,
        research,
        learningPerformance,
        reviews,
        signalConfig,
        lastAlert: lastAlert
          ? {
              alertId: lastAlert.alertId,
              symbol: lastAlert.symbol,
              side: lastAlert.side,
              setupType: lastAlert.setupType,
              detectedAt: lastAlert.detectedAt,
              finalScore: lastAlert.candidate.finalScore ?? null,
              allowed: lastAlert.riskDecision.allowed
            }
          : null
      }
    });
  });

  app.get('/ai/context/compact', async (_request, reply) => {
    return reply.status(200).send({
      context: await buildCompactAiContext()
    });
  });

  app.get('/ai/desk-brief', async (_request, reply) => {
    return reply.status(200).send(await buildDeskBrief());
  });

  app.get('/home/deck', async (_request, reply) => {
    return reply.status(200).send(await buildHomeDeck());
  });

  app.get('/calendar/events', async (request, reply) => {
    const limitParam = (request.query as { limit?: string | number } | undefined)?.limit;
    const parsedLimit =
      typeof limitParam === 'number'
        ? limitParam
        : typeof limitParam === 'string'
          ? Number.parseInt(limitParam, 10)
          : 12;
    const limit = Number.isFinite(parsedLimit) ? Math.min(50, Math.max(1, parsedLimit)) : 12;
    const events = (await calendarClient.listUpcomingEvents())
      .filter((event) => Date.parse(event.startsAt) >= Date.now() - 5 * 60 * 1000)
      .slice(0, limit);

    return reply.status(200).send({
      calendar: {
        ...calendarClient.status(),
        events
      }
    });
  });

  app.get('/research/status', async (_request, reply) => {
    return reply.status(200).send({
      research: marketResearchService ? marketResearchService.status() : { enabled: false, started: false }
    });
  });

  app.get('/signals/monitor/status', async (_request, reply) => {
    const status: SignalMonitorStatus | { enabled: false; started: false } = signalMonitorService
      ? signalMonitorService.status()
      : { enabled: false, started: false };

    return reply.status(200).send({
      monitor: status
    });
  });

  app.get('/notifications/webpush/status', async (_request, reply) => {
    const status: WebPushNotificationStatus | { enabled: false; ready: false; subscriberCount: 0 } =
      webPushNotificationService
        ? webPushNotificationService.status()
        : { enabled: false, ready: false, subscriberCount: 0 };

    return reply.status(200).send({
      webPush: status
    });
  });

  app.get('/notifications/native/status', async (_request, reply) => {
    const status: NativePushNotificationStatus | { enabled: false; ready: false; deviceCount: 0; environment: 'sandbox' } =
      nativePushNotificationService
        ? nativePushNotificationService.status()
        : { enabled: false, ready: false, deviceCount: 0, environment: 'sandbox' };

    return reply.status(200).send({
      nativePush: status
    });
  });

  app.get('/notifications/telegram/status', async (_request, reply) => {
    const status: TelegramAlertStatus | { enabled: false; ready: false; chatConfigured: false } = telegramAlertService
      ? telegramAlertService.status()
      : { enabled: false, ready: false, chatConfigured: false };

    return reply.status(200).send({
      telegram: status
    });
  });

  app.get('/notifications/ibkr-login-reminder/status', async (_request, reply) => {
    const status: OperationalReminderStatus | { enabled: false; started: false; timezone: string; sundayTime: string } =
      operationalReminderService
        ? operationalReminderService.status()
        : { enabled: false, started: false, timezone: 'America/Chicago', sundayTime: '16:30' };

    return reply.status(200).send({
      ibkrLoginReminder: status
    });
  });

  app.post('/notifications/test/alert', async (request, reply) => {
    if (!signalMonitorService) {
      return reply.status(409).send({
        message: 'Signal monitor is disabled'
      });
    }

    const rawSymbol = (request.body as { symbol?: string } | undefined)?.symbol?.toUpperCase();
    const symbol = rawSymbol === 'ES' ? 'ES' : 'NQ';
    const alert = await signalMonitorService.triggerTestAlert(symbol);

    return reply.status(200).send({
      ok: true,
      alert: {
        alertId: alert.alertId,
        symbol: alert.symbol,
        setupType: alert.setupType,
        side: alert.side,
        detectedAt: alert.detectedAt,
        finalScore: alert.candidate.finalScore ?? null
      }
    });
  });

  app.post('/notifications/test/ibkr-login-reminder', async (_request, reply) => {
    if (!operationalReminderService) {
      return reply.status(409).send({
        message: 'IBKR login reminder is disabled'
      });
    }

    await operationalReminderService.sendTestReminder();
    return reply.status(200).send({
      ok: true,
      ibkrLoginReminder: operationalReminderService.status()
    });
  });

  app.post('/notifications/ibkr/connected', async (request, reply) => {
    const body = (request.body as { symbols?: string[]; source?: string; connectedAt?: string } | undefined) ?? {};
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const connectedAt = body.connectedAt ?? new Date().toISOString();
    const source = body.source?.trim() || 'ibkr-bridge';
    const symbolText = symbols.length > 0 ? ` for ${symbols.join(', ')}` : '';
    const title = 'IBKR connected';
    const hadPendingReconnect = ibkrReconnectState.lastLoginRequiredAtMs > ibkrReconnectState.lastConnectedAtMs;
    const previousConnectedAtMs = ibkrReconnectState.lastConnectedAtMs;
    ibkrReconnectState.lastConnectedAtMs = Date.parse(connectedAt) || Date.now();
    ibkrReconnectState.lastSource = source;
    if (symbols.length > 0) {
      ibkrReconnectState.lastSymbols = [...symbols];
    }
    if (ibkrReconnectState.pendingTimer) {
      clearTimeout(ibkrReconnectState.pendingTimer);
      ibkrReconnectState.pendingTimer = undefined;
    }
    const loopbackRequest = isLoopbackIp(request.ip);
    const autoCutoverEnabled = parseBooleanEnv('IBKR_AUTO_CUTOVER_ENABLED', true);
    let yahooCutover: { attempted: boolean; stopped: boolean; message: string } = {
      attempted: false,
      stopped: false,
      message: 'Yahoo fallback unchanged'
    };

    if (autoCutoverEnabled && loopbackRequest && source === 'ibkr-bridge') {
      yahooCutover = {
        attempted: true,
        stopped: true,
        message: 'Yahoo fallback stopped automatically after IBKR live bars arrived'
      };
      try {
        await runCommand('pm2', ['stop', 'yahoo-bridge']);
        await runCommand('pm2', ['save']);
      } catch (error) {
        yahooCutover = {
          attempted: true,
          stopped: false,
          message: `Yahoo auto-cutover failed: ${(error as Error).message}`
        };
      }
    }

    const bodyText = yahooCutover.stopped
      ? `The server-side IBKR bridge is connected and receiving live bars${symbolText}. Yahoo fallback has been stopped automatically.`
      : `The server-side IBKR bridge is connected and receiving live bars${symbolText}.`;
    await appendIbkrReconnectHistory({
      kind: 'CONNECTED',
      atMs: ibkrReconnectState.lastConnectedAtMs,
      source,
      symbols: symbols.length > 0 ? symbols : [...ibkrReconnectState.lastSymbols],
      detail: yahooCutover.message
    });
    const shouldNotifyUsers = (hadPendingReconnect || previousConnectedAtMs === 0) && canNotifyIbkrRecovery(source);
    const shouldNotifyManualRecoveryCompletion =
      hadPendingReconnect && hasManualRecoveryActivitySince(ibkrReconnectState.lastLoginRequiredAtMs);
    const notifyUsers = shouldNotifyUsers || shouldNotifyManualRecoveryCompletion;

    const deliveries = notifyUsers
      ? [
          await notifyTradeAssistChannels(
            {
              title,
              body: bodyText,
              url: ibkrStatusUrl,
              tag: 'ibkr-connected'
            },
            {
              title,
              lines: [
                bodyText,
                `Source: ${source}`,
                `Connected at: ${connectedAt}`,
                yahooCutover.message
              ],
              buttons: [{ text: 'Open Status', url: ibkrStatusUrl }]
            }
          )
        ]
      : [];

    return reply.status(200).send({
      ok: true,
      source,
      symbols,
      connectedAt,
      notifiedUsers: notifyUsers,
      yahooCutover,
      deliveries
    });
  });

  app.post('/notifications/ibkr/login-required', async (request, reply) => {
    const body =
      (request.body as
        | { symbols?: string[]; source?: string; reason?: string; detectedAt?: string; fallbackDelaySeconds?: number }
        | undefined) ?? {};
    const symbols = Array.isArray(body.symbols)
      ? body.symbols.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const detectedAt = body.detectedAt ?? new Date().toISOString();
    const source = body.source?.trim() || 'ibkr-bridge';
    const reason = body.reason?.trim() || 'IBKR session is not authenticated yet.';
    const fallbackDelaySeconds =
      typeof body.fallbackDelaySeconds === 'number' && Number.isFinite(body.fallbackDelaySeconds)
        ? Math.max(5, Math.min(600, Math.round(body.fallbackDelaySeconds)))
        : Math.round(ibkrReconnectFallbackDelayMs / 1000);
    const symbolText = symbols.length > 0 ? ` for ${symbols.join(', ')}` : '';
    const title = 'IBKR login required';
    const bodyText = `The server-side IBKR bridge needs a login${symbolText}.`;
    const requestedAtMs = Date.parse(detectedAt) || Date.now();
    ibkrReconnectState.lastLoginRequiredAtMs = requestedAtMs;
    ibkrReconnectState.lastFallbackAtMs = 0;
    ibkrReconnectState.lastSource = source;
    ibkrReconnectState.lastSymbols = [...symbols];
    await appendIbkrReconnectHistory({
      kind: 'LOGIN_REQUIRED',
      atMs: requestedAtMs,
      source,
      symbols,
      detail: reason
    });
    const { loginAttempt, resendAttempt } = await runIbkrRecoveryAttempt(source);
    await recordIbkrRecoveryAttempt(source, symbols, loginAttempt, resendAttempt);
    const triggerLine = describeIbkrLoginAttempt(loginAttempt);
    const resendLine = describeIbkrResendAttempt(resendAttempt);
    const notifyUsers = canNotifyIbkrRecovery(source);

    const deliveries = notifyUsers
      ? [
          await notifyTradeAssistChannels(
            {
              title,
              body: bodyText,
              url: ibkrStatusUrl,
              tag: 'ibkr-login-required'
            },
            {
              title,
              lines: [
                bodyText,
                triggerLine,
                resendLine,
                'Approve the official IBKR push on your phone if IBKR asks for IB Key.',
                `Source: ${source}`,
                `Detected at: ${detectedAt}`,
                `Reason: ${reason}`,
                `You will get a follow-up notice in about ${fallbackDelaySeconds}s if it still does not reconnect.`,
                `After that, reminders will repeat every ${ibkrReconnectReminderLabel} until it reconnects.`
              ],
              buttons: [
                { text: 'Open Status', url: ibkrStatusUrl },
                { text: 'Last-Resort Website', url: ibkrMobileUrl }
              ]
            }
          )
        ]
      : [];

    scheduleIbkrReconnectFallback(requestedAtMs, symbols, source, fallbackDelaySeconds * 1000);

    return reply.status(200).send({
      ok: true,
      source,
      symbols,
      detectedAt,
      reason,
      loginAttempt,
      resendAttempt,
      fallbackDelaySeconds,
      deliveries
    });
  });

  app.post('/ibkr/recovery/retry-login', async (_request, reply) => {
    const symbols = [...ibkrReconnectState.lastSymbols];
    await appendIbkrReconnectHistory({
      kind: 'RECOVERY_REQUESTED',
      atMs: Date.now(),
      source: 'manual-phone-retry',
      symbols,
      detail: 'Manual full recovery request received from the app.'
    });
    await notifyIbkrRecoveryRequest(
      'IBKR recovery request received',
      'manual-phone-retry',
      symbols,
      'The server is starting the full IB Gateway recovery routine.'
    );
    const result = await runIbkrRecoveryAttempt('manual-phone-retry', {
      ignoreCooldown: true
    });
    await recordIbkrRecoveryAttempt('manual-phone-retry', symbols, result.loginAttempt, result.resendAttempt);
    await notifyIbkrRecoveryAttempt(
      'IBKR recovery started',
      'manual-phone-retry',
      symbols,
      result.loginAttempt,
      result.resendAttempt
    );
    const ok = result.loginAttempt.ok || result.resendAttempt.ok;
    return reply.status(ok ? 200 : 202).send({
      ok: result.loginAttempt.ok || result.resendAttempt.ok,
      result,
      ibkrRecovery: {
        pendingReconnect: ibkrReconnectState.lastLoginRequiredAtMs > ibkrReconnectState.lastConnectedAtMs,
        lastLoginRequiredAt:
          ibkrReconnectState.lastLoginRequiredAtMs > 0
            ? new Date(ibkrReconnectState.lastLoginRequiredAtMs).toISOString()
            : undefined,
        lastConnectedAt:
          ibkrReconnectState.lastConnectedAtMs > 0 ? new Date(ibkrReconnectState.lastConnectedAtMs).toISOString() : undefined
      }
    });
  });

  app.post('/ibkr/recovery/resend-push', async (_request, reply) => {
    const symbols = [...ibkrReconnectState.lastSymbols];
    await appendIbkrReconnectHistory({
      kind: 'RECOVERY_REQUESTED',
      atMs: Date.now(),
      source: 'manual-phone-resend',
      symbols,
      detail: 'Manual broker fallback request received from the app.'
    });
    await notifyIbkrRecoveryRequest(
      'IBKR broker fallback request received',
      'manual-phone-resend',
      symbols,
      'The server is starting the broker-only fallback routine now.'
    );
    const result = await runIbkrResendPush('manual-phone-resend');
    await appendIbkrReconnectHistory({
      kind: 'RECOVERY_ATTEMPT',
      atMs: Date.now(),
      source: 'manual-phone-resend',
      symbols,
      detail: describeIbkrResendAttempt(result)
    });
    await notifyIbkrRecoveryAttempt(
      'IBKR broker fallback started',
      'manual-phone-resend',
      symbols,
      {
        ok: false,
        skipped: true,
        reason: 'manual-resend-only'
      },
      result
    );
    return reply.status(result.ok ? 200 : 202).send({
      ok: result.ok,
      result,
      ibkrRecovery: {
        pendingReconnect: ibkrReconnectState.lastLoginRequiredAtMs > ibkrReconnectState.lastConnectedAtMs,
        lastLoginRequiredAt:
          ibkrReconnectState.lastLoginRequiredAtMs > 0
            ? new Date(ibkrReconnectState.lastLoginRequiredAtMs).toISOString()
            : undefined,
        lastConnectedAt:
          ibkrReconnectState.lastConnectedAtMs > 0 ? new Date(ibkrReconnectState.lastConnectedAtMs).toISOString() : undefined
      }
    });
  });

  app.post('/notifications/ibkr/fallback-activated', async (request, reply) => {
    const body =
      (request.body as
        | {
            source?: string;
            activatedAt?: string;
            latestBarTimestamp?: string;
            liveFeedStatus?: string;
            staleMinutes?: number;
          }
        | undefined) ?? {};
    const source = body.source?.trim() || 'ibkr-fallback-watchdog';
    const activatedAt = body.activatedAt ?? new Date().toISOString();
    const liveFeedStatus = body.liveFeedStatus?.trim() || 'STALE';
    const activatedAtMs = Date.parse(activatedAt) || Date.now();
    const staleMinutes =
      typeof body.staleMinutes === 'number' && Number.isFinite(body.staleMinutes)
        ? Math.max(1, Math.round(body.staleMinutes))
        : undefined;
    const title = 'Yahoo fallback activated';
    const bodyText =
      staleMinutes !== undefined
        ? `IBKR stayed ${liveFeedStatus.toLowerCase()} for about ${staleMinutes} minute(s). Yahoo fallback has been restarted automatically.`
        : `IBKR stayed ${liveFeedStatus.toLowerCase()}. Yahoo fallback has been restarted automatically.`;
    const notifyUsers = canNotifyIbkrRecovery(source);
    await appendIbkrReconnectHistory({
      kind: 'FALLBACK_ACTIVATED',
      atMs: activatedAtMs,
      source,
      symbols: [...ibkrReconnectState.lastSymbols],
      detail: bodyText
    });

    const deliveries = notifyUsers
      ? [
          await notifyTradeAssistChannels(
            {
              title,
              body: bodyText,
              url: ibkrStatusUrl,
              tag: 'ibkr-fallback-activated'
            },
            {
              title,
              lines: [
                bodyText,
                `Source: ${source}`,
                `Activated at: ${activatedAt}`,
                body.latestBarTimestamp ? `Last IBKR bar: ${body.latestBarTimestamp}` : 'Last IBKR bar timestamp unavailable.'
              ],
              buttons: [{ text: 'Open Status', url: ibkrStatusUrl }]
            }
          )
        ]
      : [];

    return reply.status(200).send({
      ok: true,
      source,
      activatedAt,
      liveFeedStatus,
      deliveries
    });
  });

  app.post('/notifications/native/register', async (request, reply) => {
    try {
      if (!nativePushNotificationService) {
        return reply.status(409).send({
          message: 'Native push is disabled'
        });
      }

      const body = parseOrThrow(nativePushRegisterBodySchema.safeParse(request.body));
      await nativePushNotificationService.registerDevice(body);
      return reply.status(200).send({
        ok: true,
        nativePush: nativePushNotificationService.status()
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/notifications/native/unregister', async (request, reply) => {
    try {
      if (!nativePushNotificationService) {
        return reply.status(409).send({
          message: 'Native push is disabled'
        });
      }

      const body = parseOrThrow(nativePushUnregisterBodySchema.safeParse(request.body));
      await nativePushNotificationService.unregisterDevice(body.deviceToken);
      return reply.status(200).send({
        ok: true,
        nativePush: nativePushNotificationService.status()
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/notifications/webpush/public-key', async (_request, reply) => {
    if (webPushNotificationService) {
      await webPushNotificationService.start();
    }
    const publicKey = webPushNotificationService?.status().publicKey;
    if (!publicKey) {
      return reply.status(404).send({
        message: 'Web push is not enabled'
      });
    }

    return reply.status(200).send({
      publicKey
    });
  });

  app.post('/notifications/webpush/subscribe', async (request, reply) => {
    try {
      if (!webPushNotificationService) {
        return reply.status(409).send({
          message: 'Web push is disabled'
        });
      }

      const body = parseOrThrow(webPushSubscribeBodySchema.safeParse(request.body));
      await webPushNotificationService.subscribe(body.subscription, {
        deviceLabel: body.deviceLabel,
        platform: body.platform
      });
      return reply.status(200).send({
        ok: true,
        webPush: webPushNotificationService.status()
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/notifications/webpush/unsubscribe', async (request, reply) => {
    try {
      if (!webPushNotificationService) {
        return reply.status(409).send({
          message: 'Web push is disabled'
        });
      }

      const body = parseOrThrow(webPushUnsubscribeBodySchema.safeParse(request.body));
      await webPushNotificationService.unsubscribe(body.endpoint);
      return reply.status(200).send({
        ok: true,
        webPush: webPushNotificationService.status()
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/risk/check', async (request, reply) => {
    try {
      const body = parseOrThrow(riskCheckBodySchema.safeParse(request.body));
      const liveNewsEvents = body.newsEvents ?? (await calendarClient.listUpcomingEvents());

      const decision = evaluateRisk(
        {
          ...body,
          newsEvents: liveNewsEvents
        },
        riskConfigStore.get()
      );

      journalStore.addEvent({
        type: 'RISK_CHECKED',
        timestamp: body.now,
        candidateId: body.candidate.id,
        symbol: body.candidate.symbol,
        payload: {
          allowed: decision.allowed,
          reasonCodes: decision.reasonCodes,
          finalRiskPct: decision.finalRiskPct
        }
      });

      return reply.status(200).send({ decision });
    } catch (error) {
      return reply.status(400).send({ message: 'Invalid risk check request', error });
    }
  });

  app.get('/risk/config', async (_request, reply) => {
    return reply.status(200).send({
      config: riskConfigStore.get()
    });
  });

  app.patch('/risk/config', async (request, reply) => {
    try {
      const body = parseOrThrow(riskConfigPatchSchema.safeParse(request.body));
      const updated = riskConfigStore.patch(body);
      return reply.status(200).send({ config: updated });
    } catch (error) {
      return reply.status(400).send({ message: 'Invalid risk config patch', error: (error as Error).message });
    }
  });

  app.post('/execution/propose', async (request, reply) => {
    try {
      const body = parseOrThrow(executionProposeBodySchema.safeParse(request.body));
      const intent = executionService.propose(body.candidate, body.riskDecision, body.now);
      return reply.status(200).send({ intent });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/execution/approve', async (request, reply) => {
    try {
      const body = parseOrThrow(executionApproveBodySchema.safeParse(request.body));
      const intent = await executionService.approve(
        body.intentId,
        body.approvedBy,
        body.now,
        body.manualChecklistConfirmed,
        body.paperAccountConfirmed
      );
      return reply.status(200).send({ intent });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.get('/execution/pending', async (_request, reply) => {
    return reply.status(200).send({
      intents: journalStore.listIntents('PROPOSED')
    });
  });

  app.get('/journal/trades', async (_request, reply) => {
    return reply.status(200).send({
      trades: journalStore.listTrades(),
      events: journalStore.listEvents()
    });
  });

  app.get('/training/status', async (_request, reply) => {
    if (!continuousTrainingService) {
      return reply.status(200).send({
        training: {
          enabled: false,
          started: false
        }
      });
    }
    return reply.status(200).send({
      training: continuousTrainingService.status()
    });
  });

  app.post('/training/ingest-bars', async (request, reply) => {
    try {
      if (!continuousTrainingService && !signalMonitorService) {
        return reply.status(409).send({
          message: 'No live bar consumers are enabled'
        });
      }

      const body = parseOrThrow(trainingIngestBarsBodySchema.safeParse(request.body));
      const ingest = continuousTrainingService
        ? await continuousTrainingService.ingestBars(body.bars, 'api')
        : {
            accepted: 0,
            deduped: 0,
            barCount: 0,
            latestBarTimestamp: undefined
          };
      const signalIngest = signalMonitorService ? await signalMonitorService.ingestBars(body.bars) : { accepted: 0 };
      const researchIngest = marketResearchService ? await marketResearchService.ingestBars(body.bars) : { accepted: 0 };
      return reply.status(200).send({
        ingest,
        signalMonitor: signalMonitorService ? signalMonitorService.status() : { enabled: false, started: false },
        signalIngest,
        research: marketResearchService ? marketResearchService.status() : { enabled: false, started: false },
        researchIngest,
        training: continuousTrainingService
          ? continuousTrainingService.status()
          : { enabled: false, started: false }
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  app.post('/training/retrain', async (_request, reply) => {
    try {
      if (!continuousTrainingService) {
        return reply.status(409).send({
          message: 'Continuous training is disabled'
        });
      }

      const run = await continuousTrainingService.forceRetrain();
      return reply.status(200).send({
        run,
        training: continuousTrainingService.status()
      });
    } catch (error) {
      return reply.status(400).send({ message: (error as Error).message });
    }
  });

  return {
    app,
    journalStore,
    riskConfigStore,
    executionService,
    tradeLockerClient,
    calendarClient,
    rankingModel: rankingModelStore.get(),
    rankingModelStore,
    continuousTrainingService,
    signalMonitorService,
    signalMonitorSettingsStore,
    signalReviewStore,
    nativePushNotificationService,
    webPushNotificationService,
    telegramAlertService,
    operationalReminderService,
    marketResearchService
  };
};
