import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { getCmeEquitySessionState, type CmeEquitySessionState } from './domain/cmeEquityHours.js';
import { generateSetupCandidates } from './domain/setupDetectors.js';
import type { NewsEvent, SignalAlert, SignalReviewEntry, SignalReviewOutcome, SymbolCode } from './domain/types.js';
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
  PaperTradingService,
  type PaperTradingConfig,
  type PaperTradingStatus,
  type PaperTradeEvent
} from './services/paperTradingService.js';
import {
  PaperAutonomyService,
  type PaperAutonomyConfig,
  type PaperAutonomyLearningUpdate,
  type PaperAutonomyStatus
} from './services/paperAutonomyService.js';
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
import type { AppNotificationCategory, AppNotificationPriority } from './services/notificationPreferences.js';
import { shouldNotifyIbkrRecovery } from './services/ibkrRecoveryNotificationPolicy.js';
import { JournalStore } from './stores/journalStore.js';
import {
  NotificationActivityStore,
  resolveNotificationActivityStorePath,
  type NotificationActivityEntryInput,
  type NotificationActivityTelegramTriggerReason
} from './stores/notificationActivityStore.js';
import { RiskConfigStore } from './stores/riskConfigStore.js';
import {
  IbkrReconnectStateStore,
  type IbkrReconnectHistoryEntry,
  type IbkrReconnectStateSnapshot
} from './stores/ibkrReconnectStateStore.js';
import { SignalMonitorSettingsStore } from './stores/signalMonitorSettingsStore.js';
import { SignalReviewStore, type SignalReviewSummary } from './stores/signalReviewStore.js';
import { TradeLearningStore } from './stores/tradeLearningStore.js';
import {
  SelfLearningService,
  type SelfLearningConfig,
  type SelfLearningStatus
} from './services/selfLearningService.js';
import { ContinuousTrainingService, type ContinuousTrainingConfig } from './training/continuousTrainingService.js';
import {
  buildLearningFeedbackDatasetFromTradeRecords,
  summarizeLearningPerformanceFromTradeRecords,
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
  tradeLearningStore: TradeLearningStore;
  selfLearningService: SelfLearningService | null;
  nativePushNotificationService: NativePushNotificationService | null;
  webPushNotificationService: WebPushNotificationService | null;
  telegramAlertService: TelegramAlertService | null;
  notificationActivityStore: NotificationActivityStore;
  operationalReminderService: OperationalReminderService | null;
  marketResearchService: MarketResearchService | null;
  paperTradingService: PaperTradingService | null;
  paperAutonomyService: PaperAutonomyService | null;
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
  tradeLearningStore?: TradeLearningStore;
  tradeLearningStorePath?: string;
  notificationActivityStore?: NotificationActivityStore;
  notificationActivityStorePath?: string;
  selfLearningEnabled?: boolean;
  selfLearningConfig?: Partial<SelfLearningConfig>;
  selfLearningService?: SelfLearningService | null;
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
  paperTradingEnabled?: boolean;
  paperTradingConfig?: Partial<PaperTradingConfig>;
  paperTradingService?: PaperTradingService | null;
  paperAutonomyEnabled?: boolean;
  paperAutonomyConfig?: Partial<PaperAutonomyConfig>;
  paperAutonomyService?: PaperAutonomyService | null;
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
  statePath?: string;
  bootstrapRecursive: boolean;
  maxBarsPerSymbol: number;
  focusSymbols: SymbolCode[];
  flipNotificationMinConfidence: number;
  experimentNotificationMinConfidence: number;
  evaluationMinutes: number;
  proactiveMinConfidence: number;
  experimentCooldownMinutes: number;
  maxExperiments: number;
  maxInsights: number;
}

interface PaperTradingConfigInput {
  enabled: boolean;
  statePath?: string;
  initialBalance: number;
  maxHoldMinutes: number;
  maxLiveDelayMinutes: number;
  maxConcurrentTrades: number;
  autonomyMode: 'FOLLOW_ALLOWED_ALERTS' | 'UNRESTRICTED';
  autonomyRiskPct: number;
  timezone: string;
  sessionStartHour: number;
  sessionStartMinute: number;
  sessionEndHour: number;
  sessionEndMinute: number;
  maxClosedTrades: number;
  maxEquityHistory: number;
}

interface PaperAutonomyConfigInput {
  enabled: boolean;
  statePath?: string;
  archivePath?: string;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  maxLiveDelayMinutes: number;
  timezone: string;
  sessionStartHour: number;
  sessionStartMinute: number;
  sessionEndHour: number;
  sessionEndMinute: number;
  focusSymbols: SymbolCode[];
  maxBarsPerSymbol: number;
  maxIdeas: number;
  maxHoldMinutes: number;
  minTrendConfidence: number;
  breakoutLookbackBars5m: number;
  pullbackLookbackBars5m: number;
  patternMinClosedIdeas: number;
  patternDisableClosedIdeas: number;
  explorationBudgetFraction: number;
  maxExplorationIdeasPerDay: number;
}

interface SelfLearningConfigInput {
  enabled: boolean;
  refreshIntervalMs: number;
  minResolvedRecords: number;
  minBucketSamples: number;
  recentWindowDays: number;
  maxReasonBuckets: number;
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

const parseHeaderValue = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
};

const normalizeOrigin = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return undefined;
  }
};

const originHost = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return undefined;
  }
};

const safeErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  return fallback;
};

const formatWinRateDelta = (value?: number): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '--';
  }
  const points = value * 100;
  const sign = points > 0 ? '+' : '';
  return `${sign}${points.toFixed(2)} pts`;
};

const listUpcomingEventsWithTimeout = async (
  calendarClient: EconomicCalendarClient,
  timeoutMs = 4_000
): Promise<NewsEvent[]> => {
  try {
    return await Promise.race([
      calendarClient.listUpcomingEvents(),
      new Promise<NewsEvent[]>((resolve) => {
        setTimeout(() => resolve([]), timeoutMs);
      })
    ]);
  } catch {
    return [];
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

const resolveSelfLearningConfig = (
  overrides: Partial<SelfLearningConfig> = {}
): SelfLearningConfigInput => {
  const defaults: SelfLearningConfigInput = {
    enabled: parseBooleanEnv('SELF_LEARNING_ENABLED', true),
    refreshIntervalMs: parseIntEnv('SELF_LEARNING_REFRESH_MINUTES', 5, 1, 240) * 60 * 1000,
    minResolvedRecords: parseIntEnv('SELF_LEARNING_MIN_RESOLVED_RECORDS', 8, 1, 10_000),
    minBucketSamples: parseIntEnv('SELF_LEARNING_MIN_BUCKET_SAMPLES', 3, 1, 500),
    recentWindowDays: parseIntEnv('SELF_LEARNING_RECENT_WINDOW_DAYS', 45, 1, 3650),
    maxReasonBuckets: parseIntEnv('SELF_LEARNING_MAX_REASON_BUCKETS', 6, 1, 50)
  };

  return {
    ...defaults,
    ...overrides
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
    sessionEndHour: parseIntEnv('SIGNAL_MONITOR_SESSION_END_HOUR', 13, 0, 23),
    sessionEndMinute: parseIntEnv('SIGNAL_MONITOR_SESSION_END_MINUTE', 0, 0, 59),
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
    statePath: parseOptionalPathEnv(
      'MARKET_RESEARCH_STATE_PATH',
      path.resolve(process.cwd(), 'data', 'research', 'market-research-state.json')
    ),
    bootstrapRecursive: parseBooleanEnv('MARKET_RESEARCH_BOOTSTRAP_RECURSIVE', true),
    maxBarsPerSymbol: parseIntEnv('MARKET_RESEARCH_MAX_BARS_PER_SYMBOL', 6_000, 500),
    focusSymbols: envSymbols.length > 0 ? envSymbols : ['NQ', 'ES'],
    flipNotificationMinConfidence: parseFloatEnv('MARKET_RESEARCH_FLIP_NOTIFY_CONFIDENCE', 0.55, 0, 1),
    experimentNotificationMinConfidence: parseFloatEnv('MARKET_RESEARCH_EXPERIMENT_NOTIFY_CONFIDENCE', 0.68, 0, 1),
    evaluationMinutes: parseIntEnv('MARKET_RESEARCH_EVALUATION_MINUTES', 60, 15, 240),
    proactiveMinConfidence: parseFloatEnv('MARKET_RESEARCH_PROACTIVE_MIN_CONFIDENCE', 0.64, 0, 1),
    experimentCooldownMinutes: parseIntEnv('MARKET_RESEARCH_EXPERIMENT_COOLDOWN_MINUTES', 45, 5, 720),
    maxExperiments: parseIntEnv('MARKET_RESEARCH_MAX_EXPERIMENTS', 160, 12, 1000),
    maxInsights: parseIntEnv('MARKET_RESEARCH_MAX_INSIGHTS', 48, 12, 200)
  };

  return {
    ...defaults,
    ...overrides,
    focusSymbols: overrides.focusSymbols ?? defaults.focusSymbols
  };
};

const resolvePaperTradingConfig = (
  signalMonitorConfig: SignalMonitorConfigInput,
  overrides: Partial<PaperTradingConfig> = {}
): PaperTradingConfigInput => {
  const defaults: PaperTradingConfigInput = {
    enabled: parseBooleanEnv('PAPER_TRADING_ENABLED', true),
    statePath: parseOptionalPathEnv(
      'PAPER_TRADING_STATE_PATH',
      path.resolve(process.cwd(), 'data', 'paper-trading', 'paper-account.json')
    ),
    initialBalance: parseFloatEnv('PAPER_TRADING_INITIAL_BALANCE', 100_000, 1),
    maxHoldMinutes: parseIntEnv(
      'PAPER_TRADING_MAX_HOLD_MINUTES',
      Math.max(30, Math.round(signalMonitorConfig.outcomeLookaheadBars1m)),
      15,
      1440
    ),
    maxLiveDelayMinutes: parseIntEnv('PAPER_TRADING_MAX_LIVE_DELAY_MINUTES', 3, 0, 120),
    maxConcurrentTrades: parseIntEnv('PAPER_TRADING_MAX_CONCURRENT_TRADES', 0, 0, 50),
    autonomyMode:
      (process.env.PAPER_TRADING_AUTONOMY_MODE ?? 'UNRESTRICTED').trim().toUpperCase() === 'FOLLOW_ALLOWED_ALERTS'
        ? 'FOLLOW_ALLOWED_ALERTS'
        : 'UNRESTRICTED',
    autonomyRiskPct: parseFloatEnv('PAPER_TRADING_AUTONOMY_RISK_PCT', 0.25, 0.01, 5),
    timezone: process.env.PAPER_TRADING_TIMEZONE ?? signalMonitorConfig.timezone,
    sessionStartHour: parseIntEnv(
      'PAPER_TRADING_SESSION_START_HOUR',
      signalMonitorConfig.sessionStartHour,
      0,
      23
    ),
    sessionStartMinute: parseIntEnv(
      'PAPER_TRADING_SESSION_START_MINUTE',
      signalMonitorConfig.sessionStartMinute,
      0,
      59
    ),
    sessionEndHour: parseIntEnv(
      'PAPER_TRADING_SESSION_END_HOUR',
      signalMonitorConfig.sessionEndHour,
      0,
      23
    ),
    sessionEndMinute: parseIntEnv(
      'PAPER_TRADING_SESSION_END_MINUTE',
      signalMonitorConfig.sessionEndMinute,
      0,
      59
    ),
    maxClosedTrades: parseIntEnv('PAPER_TRADING_MAX_CLOSED_TRADES', 20, 5, 200),
    maxEquityHistory: parseIntEnv('PAPER_TRADING_MAX_EQUITY_HISTORY', 120, 12, 500)
  };

  return {
    ...defaults,
    ...overrides
  };
};

const resolvePaperAutonomyConfig = (
  signalMonitorConfig: SignalMonitorConfigInput,
  overrides: Partial<PaperAutonomyConfig> = {}
): PaperAutonomyConfigInput => {
  const knownSymbols = new Set<SymbolCode>(['NQ', 'ES']);
  const envSymbols = parseCsvEnv('PAPER_AUTONOMY_SYMBOLS', ['NQ', 'ES'])
    .map((symbol) => symbol.toUpperCase() as SymbolCode)
    .filter((symbol) => knownSymbols.has(symbol));

  const defaults: PaperAutonomyConfigInput = {
    enabled: parseBooleanEnv('PAPER_AUTONOMY_ENABLED', true),
    statePath: parseOptionalPathEnv(
      'PAPER_AUTONOMY_STATE_PATH',
      path.resolve(process.cwd(), 'data', 'paper-trading', 'paper-autonomy-state.json')
    ),
    archivePath: parseOptionalPathEnv(
      'PAPER_AUTONOMY_ARCHIVE_PATH',
      path.resolve(process.cwd(), 'data', 'live', 'one-minute-bars.ndjson')
    ),
    bootstrapCsvDir: parseOptionalPathEnv('PAPER_AUTONOMY_BOOTSTRAP_DIR'),
    bootstrapRecursive: parseBooleanEnv('PAPER_AUTONOMY_BOOTSTRAP_RECURSIVE', true),
    maxLiveDelayMinutes: parseIntEnv('PAPER_AUTONOMY_MAX_LIVE_DELAY_MINUTES', 3, 0, 120),
    timezone: process.env.PAPER_AUTONOMY_TIMEZONE ?? signalMonitorConfig.timezone,
    sessionStartHour: parseIntEnv('PAPER_AUTONOMY_SESSION_START_HOUR', signalMonitorConfig.sessionStartHour, 0, 23),
    sessionStartMinute: parseIntEnv('PAPER_AUTONOMY_SESSION_START_MINUTE', signalMonitorConfig.sessionStartMinute, 0, 59),
    sessionEndHour: parseIntEnv('PAPER_AUTONOMY_SESSION_END_HOUR', signalMonitorConfig.sessionEndHour, 0, 23),
    sessionEndMinute: parseIntEnv('PAPER_AUTONOMY_SESSION_END_MINUTE', signalMonitorConfig.sessionEndMinute, 0, 59),
    focusSymbols: envSymbols.length > 0 ? envSymbols : ['NQ', 'ES'],
    maxBarsPerSymbol: parseIntEnv('PAPER_AUTONOMY_MAX_BARS_PER_SYMBOL', 6_000, 500),
    maxIdeas: parseIntEnv('PAPER_AUTONOMY_MAX_IDEAS', 300, 25, 5_000),
    maxHoldMinutes: parseIntEnv('PAPER_AUTONOMY_MAX_HOLD_MINUTES', 180, 5, 1_440),
    minTrendConfidence: parseFloatEnv('PAPER_AUTONOMY_MIN_TREND_CONFIDENCE', 0, 0, 1),
    breakoutLookbackBars5m: parseIntEnv('PAPER_AUTONOMY_BREAKOUT_LOOKBACK_BARS_5M', 6, 3, 24),
    pullbackLookbackBars5m: parseIntEnv('PAPER_AUTONOMY_PULLBACK_LOOKBACK_BARS_5M', 8, 3, 24),
    patternMinClosedIdeas: parseIntEnv('PAPER_AUTONOMY_PATTERN_MIN_CLOSED_IDEAS', 5, 1, 200),
    patternDisableClosedIdeas: parseIntEnv('PAPER_AUTONOMY_PATTERN_DISABLE_CLOSED_IDEAS', 8, 2, 200),
    explorationBudgetFraction: parseFloatEnv('PAPER_AUTONOMY_EXPLORATION_BUDGET_FRACTION', 0.2, 0, 1),
    maxExplorationIdeasPerDay: parseIntEnv('PAPER_AUTONOMY_MAX_EXPLORATION_IDEAS_PER_DAY', 2, 0, 50)
  };

  return {
    ...defaults,
    ...overrides,
    focusSymbols: overrides.focusSymbols ?? defaults.focusSymbols
  };
};

const resolvePaperTradeReviewOutcome = (event: PaperTradeEvent): SignalReviewOutcome | null => {
  if (event.kind !== 'TRADE_CLOSED') {
    return null;
  }

  switch (event.trade.exitReason) {
    case 'TAKE_PROFIT':
      return 'WOULD_WIN';
    case 'STOP_LOSS':
      return 'WOULD_LOSE';
    case 'TIME_EXIT': {
      const realizedPnl = event.trade.realizedPnl ?? 0;
      if (realizedPnl > 0) {
        return 'WOULD_WIN';
      }
      if (realizedPnl < 0) {
        return 'WOULD_LOSE';
      }
      return 'BREAKEVEN';
    }
    default:
      return null;
  }
};

const formatPaperAutonomyThesisLabel = (value: string | undefined): string => {
  switch (value) {
    case 'TREND_BREAKOUT_EXPANSION':
      return 'Trend Breakout Expansion';
    case 'TREND_PULLBACK_RECLAIM':
      return 'Trend Pullback Reclaim';
    case 'RANGE_FADE_REVERSION':
      return 'Range Fade Reversion';
    case 'FAILED_BREAKOUT_REVERSAL':
      return 'Failed Breakout Reversal';
    case 'VOLATILITY_COMPRESSION_RELEASE':
      return 'Volatility Compression Release';
    default:
      return value ?? 'Autonomy thesis';
  }
};

const formatLearningUpdateTitle = (update: PaperAutonomyLearningUpdate): string => {
  const outcomeLabel =
    update.outcome === 'WIN' ? 'win'
      : update.outcome === 'LOSS' ? 'loss'
        : 'flat';
  return `Paper autonomy learned ${outcomeLabel}`;
};

const resolveSignalReviewStorePath = (override?: string): string => {
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  if (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true') {
    return path.resolve(
      os.tmpdir(),
      `trading-algorithm-signal-reviews-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
  }

  const fromEnv = parseOptionalPathEnv(
    'SIGNAL_REVIEW_STORE_PATH',
    path.resolve(process.cwd(), 'data', 'reviews', 'signal-reviews.json')
  );

  return fromEnv ?? path.resolve(process.cwd(), 'data', 'reviews', 'signal-reviews.json');
};

const resolveTradeLearningStorePath = (override?: string): string => {
  if (override) {
    return path.resolve(process.cwd(), override);
  }

  if (process.env.NODE_ENV === 'test') {
    return path.resolve(
      os.tmpdir(),
      `trading-algorithm-trade-learning-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
    );
  }

  const fromEnv = parseOptionalPathEnv(
    'TRADE_LEARNING_STORE_PATH',
    path.resolve(process.cwd(), 'data', 'learning', 'trade-learning.json')
  );

  return fromEnv ?? path.resolve(process.cwd(), 'data', 'learning', 'trade-learning.json');
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

const resolveNotificationActivityCategory = (category?: AppNotificationCategory): AppNotificationCategory => category ?? 'engine-update';

const resolveNotificationActivityPriority = (
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
  const trustedClientHeader = 'x-tradeassist-client';
  const trustedClientValues = new Set(['mobile-web', 'native-app', 'desktop-app']);
  const publicRoutePrefixes = ['/mobile', '/health'];
  const configuredOrigins = [
    process.env.APP_BASE_URL,
    process.env.TELEGRAM_APP_URL,
    'https://167-172-252-171.sslip.io'
  ]
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
  const allowedOrigins = new Set(configuredOrigins);
  const internalApiKeys = new Map<string, string>();
  const registerInternalApiKey = (headerName: string | undefined, value: string | undefined): void => {
    const trimmedValue = value?.trim();
    const trimmedHeader = headerName?.trim().toLowerCase();
    if (!trimmedValue || !trimmedHeader) {
      return;
    }
    internalApiKeys.set(trimmedHeader, trimmedValue);
  };

  registerInternalApiKey(process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key', process.env.TRAINING_API_KEY);
  registerInternalApiKey(
    process.env.IBKR_NOTIFY_CONNECTED_API_KEY_HEADER ?? process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key',
    process.env.IBKR_NOTIFY_CONNECTED_API_KEY ?? process.env.TRAINING_API_KEY
  );
  registerInternalApiKey(
    process.env.IBKR_NOTIFY_LOGIN_REQUIRED_API_KEY_HEADER ?? process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key',
    process.env.IBKR_NOTIFY_CONNECTED_API_KEY ?? process.env.TRAINING_API_KEY
  );
  const explicitAppOriginsConfigured = Boolean(normalizeOrigin(process.env.APP_BASE_URL) || normalizeOrigin(process.env.TELEGRAM_APP_URL));
  const securityWarnings: string[] = [];
  if (internalApiKeys.size === 0) {
    securityWarnings.push('Internal API key auth is not configured for bridge and watchdog traffic.');
  }
  if (!explicitAppOriginsConfigured) {
    securityWarnings.push('Public app origin is relying on the built-in fallback host.');
  }

  const isTrustedBrowserRequest = (request: FastifyRequest): boolean => {
    const clientValue = parseHeaderValue(request.headers[trustedClientHeader])?.trim().toLowerCase();
    if (!clientValue || !trustedClientValues.has(clientValue)) {
      return false;
    }

    const secFetchSite = parseHeaderValue(request.headers['sec-fetch-site'])?.trim().toLowerCase();
    if (secFetchSite && ['same-origin', 'same-site', 'none'].includes(secFetchSite)) {
      return true;
    }

    const host = parseHeaderValue(request.headers.host)?.trim().toLowerCase();
    const requestOrigin = normalizeOrigin(parseHeaderValue(request.headers.origin));
    if (requestOrigin && (allowedOrigins.has(requestOrigin) || (host && originHost(requestOrigin) === host))) {
      return true;
    }

    const refererOrigin = normalizeOrigin(parseHeaderValue(request.headers.referer));
    if (refererOrigin && (allowedOrigins.has(refererOrigin) || (host && originHost(refererOrigin) === host))) {
      return true;
    }

    return false;
  };

  const hasValidInternalApiKey = (request: FastifyRequest): boolean => {
    for (const [headerName, expectedValue] of internalApiKeys.entries()) {
      const received = parseHeaderValue(request.headers[headerName]);
      if (received && received === expectedValue) {
        return true;
      }
    }
    return false;
  };

  const isPublicRoute = (pathname: string): boolean => publicRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  app.addHook('onRequest', async (request, reply) => {
    const pathname = new URL(request.raw.url ?? '/', 'http://localhost').pathname;
    if (isPublicRoute(pathname)) {
      return;
    }

    if (isLoopbackIp(request.ip) || hasValidInternalApiKey(request) || isTrustedBrowserRequest(request)) {
      return;
    }

    return reply.status(403).send({
      message: 'Forbidden'
    });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    if ((parseHeaderValue(request.headers['x-forwarded-proto']) ?? '').toLowerCase() === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    return payload;
  });

  const journalStore = options.journalStore ?? new JournalStore();
  const riskConfigStore = options.riskConfigStore ?? new RiskConfigStore();
  const signalMonitorSettingsStore =
    options.signalMonitorSettingsStore ??
    new SignalMonitorSettingsStore(resolveSignalMonitorSettingsStorePath(options.signalMonitorSettingsStorePath));
  const signalReviewStore =
    options.signalReviewStore ?? new SignalReviewStore(resolveSignalReviewStorePath(options.signalReviewStorePath));
  const tradeLearningStore =
    options.tradeLearningStore ?? new TradeLearningStore(resolveTradeLearningStorePath(options.tradeLearningStorePath));
  const notificationActivityStore =
    options.notificationActivityStore ??
    new NotificationActivityStore(resolveNotificationActivityStorePath(options.notificationActivityStorePath));
  const appendNotificationActivity = async (entry: NotificationActivityEntryInput): Promise<void> => {
    try {
      await notificationActivityStore.append(entry);
    } catch (error) {
      app.log.warn({ err: error, title: entry.title, category: entry.category }, 'notification activity append failed');
    }
  };
  const shouldBootstrapTradeLearningHistory =
    !(process.env.NODE_ENV === 'test'
      && options.tradeLearningStore === undefined
      && options.tradeLearningStorePath === undefined);
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
    telegramMessage?: { title: string; lines?: string[]; buttons?: Array<{ text: string; url: string }> },
    options?: { telegramFallback?: boolean }
  ) => {
    let appDelivery: Awaited<ReturnType<AppNotifier['notifyGeneric']>> | undefined;
    let appError: string | undefined;

    if (tradeAssistAppNotifier) {
      try {
        appDelivery = await tradeAssistAppNotifier.notifyGeneric(appMessage);
      } catch (error) {
        appError = (error as Error).message;
      }
    }

    const shouldFallbackToTelegram = Boolean(
      options?.telegramFallback
      && telegramAlertService
      && telegramMessage
      && (
        !tradeAssistAppNotifier
        || (appDelivery?.delivered ?? 0) === 0
      )
    );

    let telegramDelivery: Awaited<ReturnType<TelegramAlertService['notifyGeneric']>> | undefined;
    let telegramError: string | undefined;
    if (shouldFallbackToTelegram && telegramMessage) {
      try {
        telegramDelivery = await telegramAlertService?.notifyGeneric(telegramMessage);
      } catch (error) {
        telegramError = (error as Error).message;
      }
    }

    const category = resolveNotificationActivityCategory(appMessage.category);
    const priority = resolveNotificationActivityPriority(category, appMessage.priority);
    const telegramTriggerReason: NotificationActivityTelegramTriggerReason =
      !options?.telegramFallback
        ? 'fallback-disabled'
        : !telegramAlertService
          ? 'service-unavailable'
          : !tradeAssistAppNotifier
            ? 'no-app-channel'
            : (appDelivery?.delivered ?? 0) > 0
              ? 'app-delivered'
              : appError
              ? 'app-error'
              : 'zero-app-deliveries';

    await appendNotificationActivity({
      at: new Date().toISOString(),
      kind: 'generic',
      title: appMessage.title,
      body: appMessage.body,
      category,
      priority,
      tag: appMessage.tag,
      url: appMessage.url,
      source: appMessage.tag,
      app: {
        attempted: appDelivery?.attempted ?? 0,
        delivered: appDelivery?.delivered ?? 0,
        removed: appDelivery?.removed ?? 0,
        error: appError
      },
      telegram: {
        fallbackRequested: options?.telegramFallback === true,
        triggerReason: telegramTriggerReason,
        attempted: shouldFallbackToTelegram,
        sent: telegramDelivery?.sent === true,
        error: telegramError
      }
    });

    return {
      appDelivery,
      telegramDelivery,
      appError,
      telegramError
    };
  };
  const formatUsd = (value: number): string =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  const formatSignedUsd = (value: number): string => `${value >= 0 ? '+' : '-'}${formatUsd(Math.abs(value))}`;
  const formatElapsedTradeDelay = (delayMs: number): string => {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      return '<1m';
    }
    const roundedMinutes = Math.max(1, Math.round(delayMs / 60_000));
    if (roundedMinutes < 60) {
      return `${roundedMinutes}m`;
    }
    const hours = Math.floor(roundedMinutes / 60);
    const minutes = roundedMinutes % 60;
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  };
  const buildDeliveryFreshness = (
    deliveredAt: string,
    sourceAt: string,
    label: string
  ): { badge: 'LIVE' | 'DELAYED'; line: string; summary: string } => {
    const emittedAtMs = Date.parse(deliveredAt);
    const sourceAtMs = Date.parse(sourceAt);
    const delayMs =
      Number.isFinite(emittedAtMs) && Number.isFinite(sourceAtMs)
        ? Math.max(0, emittedAtMs - sourceAtMs)
        : 0;
    const lagLabel = formatElapsedTradeDelay(delayMs);
    const delayed = delayMs >= 2 * 60_000;
    return {
      badge: delayed ? 'DELAYED' : 'LIVE',
      line: delayed
        ? `Delivery: DELAYED • ${lagLabel} after ${label}`
        : `Delivery: LIVE • ${lagLabel} after ${label}`,
      summary: delayed
        ? `DELAYED ${lagLabel}`
        : 'LIVE'
    };
  };
  const buildPaperTradeDeliveryStatus = (
    event: Pick<PaperTradeEvent, 'kind' | 'at' | 'trade'>
  ): { badge: 'LIVE' | 'DELAYED'; line: string; summary: string } => {
    const tradePhase = event.kind === 'TRADE_CLOSED' ? 'trade close' : 'trade entry';
    const sourceAt =
      event.kind === 'TRADE_CLOSED'
        ? event.trade.closedAt ?? event.at
        : event.trade.filledAt ?? event.trade.submittedAt ?? event.at;
    return buildDeliveryFreshness(event.at, sourceAt, tradePhase);
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
            },
            async (entry) => {
              await appendNotificationActivity(entry);
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
              const deliveryStatus = buildDeliveryFreshness(event.changedAt, event.changedAt, 'research flip');

              await notifyTradeAssistChannels(
                {
                  title: `Research trend flipped ${directionLabel}`,
                  body: `${deliveryStatus.summary} • ${leadSymbol} leading • ${confidenceLabel} confidence • ${event.nextTrend.reason}`,
                  url: '/mobile/?tab=home&focus=research-trend',
                  category: 'engine-update',
                  priority: 'low'
                },
                {
                  title: `Research trend flipped ${directionLabel}`,
                  lines: [
                    deliveryStatus.line,
                    `Previous: ${event.previousDirection}`,
                    `Now: ${event.nextTrend.direction}`,
                    `Lead: ${leadSymbol}`,
                    `Confidence: ${confidenceLabel}`,
                    `Why: ${event.nextTrend.reason}`
                  ]
                }
              );
            },
            onExperimentOpened: async (event) => {
              if (event.experiment.source !== 'PROACTIVE') {
                return;
              }
              const confidenceLabel = `${Math.round(event.experiment.confidence * 100)}%`;
              const directionLabel = event.experiment.direction === 'BULLISH' ? 'bullish' : 'bearish';
              const leadSymbol = event.experiment.leadSymbol ?? event.experiment.symbol ?? event.overallTrend.leadSymbol ?? 'NQ/ES';
              const deliveryStatus = buildDeliveryFreshness(event.changedAt, event.changedAt, 'research experiment');
              const summary =
                event.experiment.evidence[0]
                ?? event.experiment.thesisSummary;

              await notifyTradeAssistChannels(
                {
                  title: `Research experiment opened ${directionLabel}`,
                  body: `${deliveryStatus.summary} • Thinking ${directionLabel} because ${summary}`,
                  url: '/mobile/?tab=home&focus=research-lab',
                  tag: 'research-experiment-opened',
                  category: 'engine-update',
                  priority: 'low'
                },
                {
                  title: `Research experiment opened ${directionLabel}`,
                  lines: [
                    deliveryStatus.line,
                    `Thinking: ${summary}`,
                    `Lead: ${leadSymbol}`,
                    `Confidence: ${confidenceLabel}`,
                    `Horizon: ${event.experiment.horizonMinutes}m`,
                    `Opened: ${event.changedAt}`
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
    const deliveryStatus = buildDeliveryFreshness(new Date().toISOString(), new Date().toISOString(), 'IBKR recovery step');
    await notifyTradeAssistChannels(
      {
        title,
        body: `${deliveryStatus.summary} • ${bodyText}`,
        url: ibkrStatusUrl,
        tag: 'ibkr-recovery-progress',
        category: 'broker-recovery',
        priority: 'high'
      },
      {
        title,
        lines: [
          deliveryStatus.line,
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
      },
      { telegramFallback: true }
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
    const deliveryStatus = buildDeliveryFreshness(new Date().toISOString(), new Date().toISOString(), 'IBKR recovery request');
    await notifyTradeAssistChannels(
      {
        title,
        body: `${deliveryStatus.summary} • ${bodyText}`,
        url: ibkrStatusUrl,
        tag: 'ibkr-recovery-requested',
        category: 'broker-recovery',
        priority: 'high'
      },
      {
        title,
        lines: [
          deliveryStatus.line,
          bodyText,
          detail,
          `Source: ${source}`,
          'You will get another update when the server finishes the next recovery step.'
        ],
        buttons: [{ text: 'Open Status', url: ibkrStatusUrl }]
      },
      { telegramFallback: true }
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
    const deliveryStatus = buildDeliveryFreshness(new Date().toISOString(), new Date(requestedAtMs).toISOString(), 'IBKR login required');
    const { loginAttempt, resendAttempt } = await runIbkrRecoveryAttempt(`${source}-reminder`);
    const triggerLine = describeIbkrLoginAttempt(loginAttempt);
    const resendLine = describeIbkrResendAttempt(resendAttempt);
    const notifyUsers = canNotifyIbkrRecovery(source);

    if (notifyUsers) {
      await notifyTradeAssistChannels(
        {
          title,
          body: `${deliveryStatus.summary} • ${bodyText}`,
          url: ibkrStatusUrl,
          tag: 'ibkr-login-fallback',
          category: 'broker-recovery',
          priority: 'high'
        },
        {
          title,
          lines: [
            deliveryStatus.line,
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
  const resolvedSelfLearningConfig = resolveSelfLearningConfig(options.selfLearningConfig);
  const selfLearningEnabled = options.selfLearningEnabled ?? resolvedSelfLearningConfig.enabled;
  const tradeLearningStartPromise = tradeLearningStore.start().catch((error) => {
    app.log.error({ err: error }, 'trade learning store failed to start');
  });
  let tradeLearningBootstrapPromise: Promise<void> = Promise.resolve();
  const listTradeLearningRecords = async () => {
    await tradeLearningStartPromise;
    return tradeLearningStore.listAllRecords();
  };
  const selfLearningService =
    options.selfLearningService === undefined
      ? selfLearningEnabled
        ? new SelfLearningService({
            ...resolvedSelfLearningConfig,
            enabled: true,
            recordsProvider: () => listTradeLearningRecords()
          })
        : null
      : options.selfLearningService;
  const continuousTrainingService =
    options.continuousTrainingService === undefined
      ? continuousTrainingEnabled
        ? new ContinuousTrainingService(rankingModelStore, {
            ...resolvedContinuousConfig,
            enabled: true,
            feedbackDatasetProvider: async () =>
              buildLearningFeedbackDatasetFromTradeRecords(await listTradeLearningRecords()),
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
                  tag: 'training-retrain',
                  category: 'engine-update',
                  priority: 'low'
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
  const resolvedPaperTradingConfig = resolvePaperTradingConfig(resolvedSignalMonitorConfig, options.paperTradingConfig);
  const resolvedPaperAutonomyConfig = resolvePaperAutonomyConfig(
    resolvedSignalMonitorConfig,
    options.paperAutonomyConfig
  );
  signalMonitorSettingsStore.seed({
    timezone: resolvedSignalMonitorConfig.timezone,
    sessionStartHour: resolvedSignalMonitorConfig.sessionStartHour,
    sessionStartMinute: resolvedSignalMonitorConfig.sessionStartMinute,
    sessionEndHour: resolvedSignalMonitorConfig.sessionEndHour,
    sessionEndMinute: resolvedSignalMonitorConfig.sessionEndMinute,
    nyRangeMinutes: resolvedSignalMonitorConfig.nyRangeMinutes,
    minFinalScore: resolvedSignalMonitorConfig.minFinalScore
  });
  syncRiskTradingWindowToSignalSettings();
  const paperTradingEnabled = options.paperTradingEnabled ?? resolvedPaperTradingConfig.enabled;
  const paperTradingService =
    options.paperTradingService === undefined
      ? paperTradingEnabled
        ? new PaperTradingService({
            ...resolvedPaperTradingConfig,
            enabled: true,
            getTradingWindow: () => riskConfigStore.get().tradingWindow,
            onTradeEvent: async (event: PaperTradeEvent) => {
              await tradeLearningStore.syncPaperTrade(event.trade, event.at);
              selfLearningService?.queueRefresh();
              const autonomyLearningUpdate =
                event.trade.source === 'paper-autonomy'
                  ? await paperAutonomyService?.recordTradeOutcome(event)
                  : null;

              if (event.kind === 'TRADE_OPENED') {
                const autonomyThesisLabel = formatPaperAutonomyThesisLabel(event.trade.autonomyThesis);
                const autonomyReason = event.trade.autonomyReason;
                const deliveryStatus = buildPaperTradeDeliveryStatus(event);
                await notifyTradeAssistChannels(
                  {
                    title: `Paper trade opened ${event.trade.symbol} ${event.trade.side}`,
                    body:
                      event.trade.source === 'paper-autonomy'
                        ? `${deliveryStatus.summary} • ${autonomyThesisLabel} • ${autonomyReason ?? event.trade.setupType} • Risk ${event.trade.riskPct.toFixed(2)}%`
                        : `${deliveryStatus.summary} • ${event.trade.setupType} • Entry ${event.trade.entry.toFixed(2)} • Risk ${event.trade.riskPct.toFixed(2)}%`,
                    url: '/mobile/?tab=trades',
                    tag: `paper-open-${event.trade.paperTradeId}`,
                    category: 'trade-activity',
                    priority: 'normal'
                  },
                  {
                    title: `Paper trade opened ${event.trade.symbol} ${event.trade.side}`,
                    lines: [
                      deliveryStatus.line,
                      `Setup: ${event.trade.source === 'paper-autonomy' ? autonomyThesisLabel : event.trade.setupType}`,
                      `Entry: ${event.trade.entry.toFixed(2)}`,
                      `Stop: ${event.trade.stopLoss.toFixed(2)}`,
                      `TP1: ${event.trade.takeProfit.toFixed(2)}`,
                      `Risk: ${event.trade.riskPct.toFixed(2)}%`,
                      ...(event.trade.source === 'paper-autonomy' && autonomyReason ? [`Why: ${autonomyReason}`] : [])
                    ],
                    buttons: [{ text: 'Open Paper Account', url: `${process.env.APP_BASE_URL ?? process.env.TELEGRAM_APP_URL ?? 'https://167-172-252-171.sslip.io'}/mobile/?tab=trades` }]
                  }
                );
                return;
              }

              const reviewOutcome = resolvePaperTradeReviewOutcome(event);
              if (reviewOutcome) {
                const existingReview = await signalReviewStore.getReview(event.trade.alertId);
                if (existingReview && !existingReview.outcome) {
                  const updatedReview = await signalReviewStore.applyAutoOutcome(
                    event.trade.alertId,
                    reviewOutcome,
                    event.at,
                    'paper-trading-engine'
                  );
                  journalStore.addEvent({
                    type: 'SIGNAL_AUTO_LABELED',
                    timestamp: event.at,
                    candidateId: updatedReview.candidateId,
                    symbol: updatedReview.symbol,
                    payload: {
                      alertId: updatedReview.alertId,
                      autoOutcome: updatedReview.autoOutcome ?? null,
                      effectiveOutcome: updatedReview.effectiveOutcome ?? null,
                      autoLabeledAt: updatedReview.autoLabeledAt ?? null,
                      autoLabeledBy: updatedReview.autoLabeledBy ?? null,
                      source: 'paper-trading'
                    }
                  });
                  await tradeLearningStore.syncReview(updatedReview);
                  selfLearningService?.queueRefresh();
                }
              }

              const realizedPnl = event.trade.realizedPnl ?? 0;
              const deliveryStatus = buildPaperTradeDeliveryStatus(event);
              const outcomeLabel =
                realizedPnl > 0
                  ? 'winner'
                  : realizedPnl < 0
                    ? 'loser'
                    : 'flat';
              const title =
                autonomyLearningUpdate
                  ? formatLearningUpdateTitle(autonomyLearningUpdate)
                  : `Paper trade closed ${event.trade.symbol} ${outcomeLabel}`;
              const body =
                autonomyLearningUpdate
                  ? `${deliveryStatus.summary} • ${autonomyLearningUpdate.thesisLabel} • ${formatSignedUsd(realizedPnl)} • hit rate ${Math.round(autonomyLearningUpdate.thesisHitRate * 100)}% over ${autonomyLearningUpdate.thesisClosed} trades`
                  : `${deliveryStatus.summary} • ${formatSignedUsd(realizedPnl)} • ${event.trade.exitReason ?? 'closed'} • Equity ${formatUsd(event.equityPoint.equity)}`;
              const lines = autonomyLearningUpdate
                ? [
                    deliveryStatus.line,
                    `Trade: ${autonomyLearningUpdate.symbol} ${autonomyLearningUpdate.side} • ${autonomyLearningUpdate.outcome}`,
                    `Thesis: ${autonomyLearningUpdate.thesisLabel}`,
                    `Why it traded: ${autonomyLearningUpdate.reason}`,
                    `This thesis: ${Math.round(autonomyLearningUpdate.thesisHitRate * 100)}% hit rate • ${autonomyLearningUpdate.thesisClosed} closed • ${autonomyLearningUpdate.thesisAvgR.toFixed(2)}R avg`,
                    `Realized by thesis: ${formatSignedUsd(autonomyLearningUpdate.thesisRealizedPnl)}`,
                    autonomyLearningUpdate.bestThesisChanged
                      ? `Best thesis changed: ${autonomyLearningUpdate.previousBestThesisLabel ?? 'none'} -> ${autonomyLearningUpdate.bestThesisLabel ?? autonomyLearningUpdate.thesisLabel}`
                      : `Best thesis: ${autonomyLearningUpdate.bestThesisLabel ?? autonomyLearningUpdate.thesisLabel}`,
                    `Learning samples: ${autonomyLearningUpdate.learningSamples}`,
                    `Equity: ${formatUsd(event.equityPoint.equity)}`
                  ]
                : [
                    deliveryStatus.line,
                    `P&L: ${formatSignedUsd(realizedPnl)}`,
                    `Exit: ${event.trade.exitReason ?? 'closed'}`,
                    `Equity: ${formatUsd(event.equityPoint.equity)}`,
                    `Closed: ${event.at}`
                  ];
              await notifyTradeAssistChannels(
                {
                  title,
                  body,
                  url: '/mobile/?tab=trades',
                  tag: `paper-close-${event.trade.paperTradeId}`,
                  category: 'trade-activity',
                  priority: 'normal'
                },
                {
                  title,
                  lines,
                  buttons: [{ text: 'Open Paper Account', url: `${process.env.APP_BASE_URL ?? process.env.TELEGRAM_APP_URL ?? 'https://167-172-252-171.sslip.io'}/mobile/?tab=trades` }]
                }
              );
            }
          })
        : null
      : options.paperTradingService;
  const syncTradeLearningAlert = async (alert: SignalAlert, source: string) => {
    await tradeLearningStore.recordAlert(alert, source);
    selfLearningService?.queueRefresh();
  };
  const syncTradeLearningReview = async (review: SignalReviewEntry) => {
    await tradeLearningStore.syncReview(review);
    selfLearningService?.queueRefresh();
  };
  const submitPaperLearningAlert = async (alert: SignalAlert, source: string) => {
    if (!paperTradingService) {
      return null;
    }

    const trade = await paperTradingService.recordAlert(alert, source);
    if (!trade) {
      return null;
    }

    await syncTradeLearningAlert(alert, source);
    const reviewEntry = await signalReviewStore.recordAlert(alert);
    await syncTradeLearningReview(reviewEntry);
    await tradeLearningStore.syncPaperTrade(trade, alert.detectedAt);
    selfLearningService?.queueRefresh();
    journalStore.addEvent({
      type: 'SIGNAL_GENERATED',
      timestamp: alert.detectedAt,
      candidateId: alert.candidate.id,
      symbol: alert.symbol,
      payload: {
        paperLearning: true,
        autonomousSource: source,
        alertId: alert.alertId,
        setupType: alert.setupType
      }
    });
    return trade;
  };
  const paperAutonomyEnabled = options.paperAutonomyEnabled ?? resolvedPaperAutonomyConfig.enabled;
  const paperAutonomyService =
    options.paperAutonomyService === undefined
      ? paperAutonomyEnabled && paperTradingService
        ? new PaperAutonomyService({
            ...resolvedPaperAutonomyConfig,
            enabled: true,
            getMarketResearchStatus: () => marketResearchService?.status() ?? null,
            getPaperTradingStatus: () => paperTradingService?.status() ?? null,
            getSelfLearningAdjustment: (input) => selfLearningService?.scoreAutonomyIdea(input) ?? null,
            getTradingWindow: () => riskConfigStore.get().tradingWindow,
            submitAlert: async (alert, source) => submitPaperLearningAlert(alert, source)
          })
        : null
      : options.paperAutonomyService;
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
            (candidate) => selfLearningService?.scoreSignalCandidate(candidate) ?? null,
            signalReviewStore,
            async (review) => {
              await syncTradeLearningReview(review);
            },
            null,
            async ({ alert, source }) => {
              await syncTradeLearningAlert(alert, source);
            },
            paperTradingService
              ? async ({ alert, source }) => {
                  await submitPaperLearningAlert(alert, source);
                }
              : null,
            nativePushNotificationService,
            webPushNotificationService,
            telegramAlertService,
            async (entry) => {
              await appendNotificationActivity(entry);
            }
          )
        : null
      : options.signalMonitorService;

  if (nativePushNotificationService) {
    void nativePushNotificationService.start();
  }

  const paperTradingStartPromise = paperTradingService
    ? paperTradingService.start().catch((error) => {
        app.log.error({ err: error }, 'paper trading service failed to start');
      })
    : null;

  tradeLearningBootstrapPromise = (async () => {
    await tradeLearningStartPromise;
    if (!shouldBootstrapTradeLearningHistory) {
      return;
    }
    const reviews = await signalReviewStore.listAllReviews();
    for (const review of reviews) {
      await tradeLearningStore.syncReview(review);
    }

    if (paperTradingService) {
      await paperTradingStartPromise;
      const trades = await paperTradingService.listAllTrades();
      for (const trade of trades) {
        await tradeLearningStore.syncPaperTrade(trade, trade.closedAt ?? trade.filledAt ?? trade.submittedAt);
      }
    }

    selfLearningService?.queueRefresh();
  })().catch((error) => {
    app.log.error({ err: error }, 'trade learning bootstrap failed');
  });

  const selfLearningStartPromise = selfLearningService
    ? (async () => {
        await tradeLearningStartPromise;
        await selfLearningService.start();
      })().catch((error) => {
        app.log.error({ err: error }, 'self-learning service failed to start');
      })
    : null;

  const ensureSelfLearningStarted = async (): Promise<SelfLearningService | null> => {
    if (!selfLearningService) {
      return null;
    }

    if (!selfLearningService.status().started) {
      await tradeLearningStartPromise;
      await selfLearningService.start();
    }

    return selfLearningService;
  };

  if (selfLearningService) {
    app.addHook('onClose', async () => {
      await selfLearningStartPromise;
      selfLearningService.stop();
    });
  }

  if (paperTradingService) {
    app.addHook('onClose', async () => {
      await paperTradingStartPromise;
      paperTradingService.stop();
    });
  }

  const paperAutonomyStartPromise = paperAutonomyService
    ? paperAutonomyService.start().catch((error) => {
        app.log.error({ err: error }, 'paper autonomy service failed to start');
      })
    : null;

  if (paperAutonomyService) {
    app.addHook('onClose', async () => {
      await paperAutonomyStartPromise;
      paperAutonomyService.stop();
    });
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

  const syncPaperSessionState = async (now = new Date().toISOString()) => {
    if (!paperTradingService) {
      return null;
    }
    await paperTradingService.reconcileMarketSession(now);
    return paperTradingService.status(now);
  };

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
    const learningPerformance = summarizeLearningPerformanceFromTradeRecords(await listTradeLearningRecords());
    const research = marketResearchService ? marketResearchService.status() : null;
    const paper = await syncPaperSessionState();
    const lastAlert = signalMonitorService?.listAlerts(1)[0];
    const calendarEvents = (await listUpcomingEventsWithTimeout(calendarClient))
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
            adaptiveHitRate: Number((research.performance.adaptiveHitRate ?? research.performance.hitRate).toFixed(3)),
            evaluatedPredictions: research.performance.evaluatedPredictions,
            openPredictions: research.performance.openPredictions,
            activeHypotheses: research.knowledgeBase.activeHypotheses.length,
            bestThesis: research.knowledgeBase.bestThesis
              ? {
                  label: research.knowledgeBase.bestThesis.label,
                  hitRate: Number(research.knowledgeBase.bestThesis.hitRate.toFixed(3)),
                  sampleSize: research.knowledgeBase.bestThesis.evaluated
                }
              : null
          }
        : null,
      paper: paper
        ? {
            balance: Number(paper.balance.toFixed(2)),
            equity: Number(paper.equity.toFixed(2)),
            hitRate: Number(paper.hitRate.toFixed(3)),
            openTrades: paper.openTrades,
            closedTrades: paper.closedTrades
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
    const paper = await syncPaperSessionState();
    const paperAutonomy = paperAutonomyService?.status() ?? null;
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
              entry:
                typeof latestAlert.candidate.entry === 'number'
                  ? Number(latestAlert.candidate.entry.toFixed(2))
                  : null,
              stopLoss:
                typeof latestAlert.candidate.stopLoss === 'number'
                  ? Number(latestAlert.candidate.stopLoss.toFixed(2))
                  : null,
              takeProfitOne:
                typeof latestAlert.candidate.takeProfit?.[0] === 'number'
                  ? Number(latestAlert.candidate.takeProfit[0].toFixed(2))
                  : null,
              finalScore:
                typeof latestAlert.candidate.finalScore === 'number'
                  ? Number(latestAlert.candidate.finalScore.toFixed(1))
                  : null,
              oneMinuteConfidence:
                typeof latestAlert.candidate.oneMinuteConfidence === 'number'
                  ? Number(latestAlert.candidate.oneMinuteConfidence.toFixed(2))
                  : null,
              allowed: latestAlert.riskDecision.allowed,
              guardrails: (latestAlert.riskDecision.reasonCodes ?? []).slice(0, 3),
              reasons: (latestAlert.candidate.eligibility?.passReasons ?? []).slice(0, 3)
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
        awaitingOutcomeCount: reviewSummary.pending,
        learnedCaseCount: reviewSummary.completed,
        reviewPending: reviewSummary.pending,
        modelId: context.desk.rankingModelId,
        paperAccount: paper
          ? {
              initialBalance: Number(paper.initialBalance.toFixed(2)),
              marketSessionState: context.desk.marketSessionState,
              tradableSymbols: ['NQ', 'ES'],
              maxConcurrentTrades: paper.maxConcurrentTrades,
              autonomyMode: paper.autonomyMode,
              autonomyRiskPct: Number(paper.autonomyRiskPct.toFixed(2)),
              balance: Number(paper.balance.toFixed(2)),
              equity: Number(paper.equity.toFixed(2)),
              realizedPnl: Number(paper.realizedPnl.toFixed(2)),
              unrealizedPnl: Number(paper.unrealizedPnl.toFixed(2)),
              openTrades: paper.openTrades,
              pendingEntries: paper.pendingEntries,
              closedTrades: paper.closedTrades,
              hitRate: Number(paper.hitRate.toFixed(3)),
              totalReturnPct: Number((((paper.equity - paper.initialBalance) / Math.max(paper.initialBalance, 1)) * 100).toFixed(2)),
              lastUpdatedAt: paper.lastUpdatedAt ?? null,
              equityHistory: paper.equityHistory.slice(-32)
            }
          : null,
        paperAutonomy: paperAutonomy
          ? {
              enabled: paperAutonomy.enabled,
              started: paperAutonomy.started,
              lastIdeaAt: paperAutonomy.lastIdeaAt ?? null,
              lastEvaluatedAt: paperAutonomy.lastEvaluatedAt ?? null,
              totalIdeas: paperAutonomy.totalIdeas,
              openIdeas: paperAutonomy.openIdeas,
              closedIdeas: paperAutonomy.closedIdeas,
              winRate: Number(paperAutonomy.winRate.toFixed(3)),
              session: {
                timezone: paperAutonomy.session.timezone,
                startHour: paperAutonomy.session.startHour,
                startMinute: paperAutonomy.session.startMinute,
                endHour: paperAutonomy.session.endHour,
                endMinute: paperAutonomy.session.endMinute
              },
              performance: {
                realizedPnl: Number(paperAutonomy.performance.realizedPnl.toFixed(2)),
                realizedR: Number(paperAutonomy.performance.realizedR.toFixed(2)),
                avgR: Number(paperAutonomy.performance.avgR.toFixed(2)),
                wins: paperAutonomy.performance.wins,
                losses: paperAutonomy.performance.losses,
                flats: paperAutonomy.performance.flats,
                learningSamples: paperAutonomy.performance.learningSamples
              },
              bestThesis: paperAutonomy.bestThesis
                ? {
                    thesis: paperAutonomy.bestThesis.thesis,
                    label: paperAutonomy.bestThesis.label,
                    hitRate: Number(paperAutonomy.bestThesis.hitRate.toFixed(3)),
                    avgR: Number(paperAutonomy.bestThesis.avgR.toFixed(2)),
                    closed: paperAutonomy.bestThesis.closed,
                    realizedPnl: Number(paperAutonomy.bestThesis.realizedPnl.toFixed(2))
                  }
                : null,
              explorationBudget: {
                fraction: Number(paperAutonomy.explorationBudget.fraction.toFixed(2)),
                hardCap: paperAutonomy.explorationBudget.hardCap,
                allowedToday: paperAutonomy.explorationBudget.allowedToday,
                usedToday: paperAutonomy.explorationBudget.usedToday,
                remainingToday: paperAutonomy.explorationBudget.remainingToday,
                totalIdeasToday: paperAutonomy.explorationBudget.totalIdeasToday,
                sessionDay: paperAutonomy.explorationBudget.sessionDay,
                available: paperAutonomy.explorationBudget.available,
                summary: compactText(paperAutonomy.explorationBudget.summary, 140)
              },
              activeTheses: paperAutonomy.activeTheses.slice(0, 4).map((entry) => ({
                thesis: entry.thesis,
                label: entry.label,
                openIdeas: entry.openIdeas,
                totalIdeas: entry.totalIdeas,
                lastOpenedAt: entry.lastOpenedAt ?? null
              })),
              patternStates: paperAutonomy.patternStates.slice(0, 8).map((entry) => ({
                key: entry.key,
                thesis: entry.thesis,
                label: entry.label,
                symbol: entry.symbol,
                researchDirection: entry.researchDirection,
                exploratory: entry.exploratory,
                state: entry.state,
                total: entry.total,
                open: entry.open,
                closed: entry.closed,
                wins: entry.wins,
                losses: entry.losses,
                flats: entry.flats,
                winRate: Number(entry.winRate.toFixed(3)),
                avgR: Number(entry.avgR.toFixed(2)),
                realizedPnl: Number(entry.realizedPnl.toFixed(2)),
                recentLossStreak: entry.recentLossStreak,
                reason: compactText(entry.reason, 160),
                cooldownSummary: compactText(entry.cooldownSummary, 160),
                lastOpenedAt: entry.lastOpenedAt ?? null,
                lastClosedAt: entry.lastClosedAt ?? null
              })),
              symbolStatus: paperAutonomy.symbolStatus.map((entry) => ({
                symbol: entry.symbol,
                direction: entry.direction,
                confidence: Number(entry.confidence.toFixed(2)),
                exploratory: entry.exploratory,
                reason: compactText(entry.reason, 120),
                latestBarTimestamp: entry.latestBarTimestamp ?? null,
                openIdeas: entry.openIdeas,
                closedIdeas: entry.closedIdeas,
                winRate: Number(entry.winRate.toFixed(3)),
                realizedPnl: Number(entry.realizedPnl.toFixed(2))
              })),
              latestIdea: paperAutonomy.recentIdeas[0]
                ? {
                    symbol: paperAutonomy.recentIdeas[0].symbol,
                    side: paperAutonomy.recentIdeas[0].side,
                    thesis: paperAutonomy.recentIdeas[0].thesis,
                    thesisLabel: paperAutonomy.thesisStats.find((entry) => entry.thesis === paperAutonomy.recentIdeas[0].thesis)?.label
                      ?? paperAutonomy.recentIdeas[0].thesis,
                    score: Number(paperAutonomy.recentIdeas[0].score.toFixed(1)),
                    openedAt: paperAutonomy.recentIdeas[0].openedAt,
                    reason: compactText(paperAutonomy.recentIdeas[0].reason, 140)
                  }
                : null,
              recentDecisions: paperAutonomy.recentDecisions.slice(0, 8).map((entry) => ({
                id: entry.id,
                timestamp: entry.timestamp,
                symbol: entry.symbol,
                side: entry.side,
                thesis: entry.thesis,
                researchDirection: entry.researchDirection,
                exploratory: entry.exploratory,
                patternState: entry.patternState,
                allocation: entry.allocation,
                outcome: entry.outcome,
                score: Number(entry.score.toFixed(1)),
                finalScore: Number(entry.finalScore.toFixed(1)),
                riskPct: Number(entry.riskPct.toFixed(2)),
                summary: compactText(entry.summary, 140),
                reason: compactText(entry.reason, 180),
                cooldownSummary: compactText(entry.cooldownSummary, 160)
              }))
            }
          : null,
        researchLab: research
          ? {
              activeHypothesesCount: research.knowledgeBase.activeHypotheses.length,
              bestThesis: research.knowledgeBase.bestThesis
                ? {
                    label: research.knowledgeBase.bestThesis.label,
                    hitRate: Number(research.knowledgeBase.bestThesis.hitRate.toFixed(3)),
                    evaluated: research.knowledgeBase.bestThesis.evaluated,
                    total: research.knowledgeBase.bestThesis.total,
                    lastOutcome: research.knowledgeBase.bestThesis.lastOutcome ?? null
                  }
                : null,
              activeHypotheses: research.knowledgeBase.activeHypotheses.slice(0, 3).map((experiment) => ({
                thesis: experiment.thesis,
                thesisLabel: experiment.thesisSummary,
                direction: experiment.direction,
                confidence: Number(experiment.confidence.toFixed(2)),
                leadSymbol: experiment.leadSymbol ?? experiment.symbol ?? null,
                openedAt: experiment.openedAt,
                horizonMinutes: experiment.horizonMinutes,
                evidence: experiment.evidence.slice(0, 2)
              })),
              latestInsight: research.knowledgeBase.recentInsights[0]
                ? {
                    headline: compactText(research.knowledgeBase.recentInsights[0].headline, 96),
                    detail: compactText(research.knowledgeBase.recentInsights[0].detail, 140),
                    at: research.knowledgeBase.recentInsights[0].at
                  }
                : null
            }
          : null,
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

  const buildLearningSummaryPayload = (summary: SignalReviewSummary) => ({
    awaitingOutcome: summary.pending,
    learned: summary.completed,
    total: summary.total,
    manualResolved: summary.manualResolved,
    autoResolved: summary.autoResolved,
    unresolvedOutcome: summary.pendingOutcome,
    pending: summary.pending,
    completed: summary.completed,
    pendingOutcome: summary.pendingOutcome
  });

  const buildLearningCollectionPayload = (reviews: SignalReviewEntry[], summary: SignalReviewSummary) => ({
    cases: reviews,
    learningSummary: buildLearningSummaryPayload(summary),
    reviews,
    summary
  });

  const buildLearningMutationPayload = (
    review: SignalReviewEntry,
    summary: SignalReviewSummary,
    extras: Record<string, unknown> = {}
  ) => ({
    caseEntry: review,
    learningSummary: buildLearningSummaryPayload(summary),
    review,
    summary,
    ...extras
  });

  const mobileRoot = path.resolve(process.cwd(), 'public', 'mobile');

  app.register(fastifyStatic, {
    root: mobileRoot,
    prefix: '/mobile/'
  });

  app.get('/mobile', async (_request, reply) => reply.redirect('/mobile/'));
  app.get('/mobile/2*', async (request, reply) => {
    const malformedPath = request.raw.url ?? '/mobile/';
    const prefix = '/mobile/2';
    const index = malformedPath.indexOf(prefix);
    const encodedQuery = index >= 0 ? malformedPath.slice(index + prefix.length) : '';
    const query = encodedQuery.length > 0 ? encodedQuery : '';
    return reply.redirect(`/mobile/${query.length > 0 ? `?${query}` : ''}`);
  });

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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Invalid signal generation request') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Invalid signal rank request') });
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
        ...buildLearningMutationPayload(review, summary)
      });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Replay export failed') });
    }
  });

  app.get('/signals/learning', async (request, reply) => {
    const query = (request.query as { status?: string; limit?: string } | undefined) ?? {};
    const normalizedStatus = (query.status ?? 'ALL').toUpperCase();
    const parsedStatus = normalizedStatus === 'ALL' ? { success: true as const, data: 'ALL' as const } : signalReviewStatusSchema.safeParse(normalizedStatus);
    const status = parsedStatus.success ? parsedStatus.data : null;
    if (!status) {
      return reply.status(400).send({
        message: 'Invalid learning status filter'
      });
    }

    const parsedLimit = Number.parseInt(query.limit ?? '40', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 40;
    const [reviews, summary] = await Promise.all([
      signalReviewStore.listReviews(status as 'ALL' | 'PENDING' | 'COMPLETED', limit),
      signalReviewStore.summary()
    ]);

    return reply.status(200).send(buildLearningCollectionPayload(reviews, summary));
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

    return reply.status(200).send(buildLearningCollectionPayload(reviews, summary));
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
    const selfLearning = (await ensureSelfLearningStarted())?.status() ?? null;
    const records = await listTradeLearningRecords();
    const performance = summarizeLearningPerformanceFromTradeRecords(records);
    const feedback = buildLearningFeedbackDatasetFromTradeRecords(records);
    const database = await tradeLearningStore.summary();

    return reply.status(200).send({
      performance,
      feedback: feedback.counts,
      database,
      selfLearning
    });
  });

  app.post('/signals/reviews', async (request, reply) => {
    try {
      const body = parseOrThrow(signalReviewUpsertBodySchema.safeParse(request.body));
      const review = await signalReviewStore.upsertReview(body);
      await syncTradeLearningReview(review);
      const summary = await signalReviewStore.summary();
      const paperAutonomyLearning = await paperAutonomyService?.recordReplayReview(review);
      const marketResearchLearning = await marketResearchService?.recordReplayReview(review);

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
        ...buildLearningMutationPayload(review, summary),
        tradeLearning: await tradeLearningStore.getRecord(review.alertId),
        learning: {
          paperAutonomy: paperAutonomyLearning ?? null,
          marketResearch: marketResearchLearning ?? null
        }
      });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Review update failed') });
    }
  });

  app.post('/signals/learning', async (request, reply) => {
    try {
      const body = parseOrThrow(signalReviewUpsertBodySchema.safeParse(request.body));
      const review = await signalReviewStore.upsertReview(body);
      await syncTradeLearningReview(review);
      const summary = await signalReviewStore.summary();
      const paperAutonomyLearning = await paperAutonomyService?.recordReplayReview(review);
      const marketResearchLearning = await marketResearchService?.recordReplayReview(review);

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
        ...buildLearningMutationPayload(review, summary),
        tradeLearning: await tradeLearningStore.getRecord(review.alertId),
        learning: {
          paperAutonomy: paperAutonomyLearning ?? null,
          marketResearch: marketResearchLearning ?? null
        }
      });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Learning case update failed') });
    }
  });

  app.get('/signals/config', async (_request, reply) => {
    return reply.status(200).send({
      config: signalMonitorSettingsStore.get()
    });
  });

  app.get('/trade-learning/records', async (request, reply) => {
    const query = (request.query as { status?: string; limit?: string } | undefined) ?? {};
    const normalizedStatus = (query.status ?? 'ALL').toUpperCase();
    const status =
      normalizedStatus === 'ALL' || normalizedStatus === 'PENDING' || normalizedStatus === 'RESOLVED'
        ? normalizedStatus
        : null;
    if (!status) {
      return reply.status(400).send({
        message: 'Invalid trade learning status filter'
      });
    }

    const parsedLimit = Number.parseInt(query.limit ?? '50', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 250) : 50;
    const [records, summary] = await Promise.all([
      tradeLearningStore.listRecords(status as 'ALL' | 'PENDING' | 'RESOLVED', limit),
      tradeLearningStore.summary()
    ]);

    return reply.status(200).send({
      records,
      summary
    });
  });

  app.get('/trade-learning/summary', async (_request, reply) => {
    const [summary, records] = await Promise.all([
      tradeLearningStore.summary(),
      tradeLearningStore.listRecords('RESOLVED', 20)
    ]);

    return reply.status(200).send({
      summary,
      recentResolvedRecords: records
    });
  });

  app.get('/trade-learning/profile', async (_request, reply) => {
    const selfLearning = (await ensureSelfLearningStarted())?.status();
    if (!selfLearning) {
      return reply.status(200).send({
        selfLearning: {
          enabled: false,
          started: false
        } satisfies Pick<SelfLearningStatus, 'enabled' | 'started'>
      });
    }

    return reply.status(200).send({
      selfLearning
    });
  });

  app.patch('/signals/config', async (request, reply) => {
    try {
      const body = parseOrThrow(signalMonitorSettingsPatchSchema.safeParse(request.body));
      const config = await signalMonitorSettingsStore.patch(body);
      syncRiskTradingWindowToSignalSettings();
      return reply.status(200).send({ config });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Signal monitor settings update failed') });
    }
  });

  app.get('/diagnostics', async (_request, reply) => {
    await notificationActivityStore.start();
    const selfLearning = (await ensureSelfLearningStarted())?.status() ?? { enabled: false, started: false };
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
    const calendarEvents = await listUpcomingEventsWithTimeout(calendarClient);
    const calendarStatus = calendarClient.status();
    const upcomingCalendarEvents = calendarEvents
      .filter((event) => Date.parse(event.startsAt) >= Date.now() - 5 * 60 * 1000)
      .slice(0, 8);
    const reviews = await signalReviewStore.summary();
    const learningCases = buildLearningSummaryPayload(reviews);
    const tradeLearning = await tradeLearningStore.summary();
    const learningPerformance = summarizeLearningPerformanceFromTradeRecords(await listTradeLearningRecords());
    const signalConfig = signalMonitorSettingsStore.get();
    const training = continuousTrainingService?.status() ?? { enabled: false, started: false };
    const research: MarketResearchStatus | { enabled: false; started: false } = marketResearchService
      ? marketResearchService.status()
      : { enabled: false, started: false };
    const paperAccount: PaperTradingStatus | { enabled: false; started: false } =
      (await syncPaperSessionState()) ?? { enabled: false, started: false };
    const paperAutonomy: PaperAutonomyStatus | { enabled: false; started: false } = paperAutonomyService
      ? paperAutonomyService.status()
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
          telegramFallbackMode: 'broker-recovery-only',
          ibkrLoginReminderEnabled: operationalReminder.enabled,
          ibkrLoginReminderStarted: operationalReminder.started,
          recentActivity: notificationActivityStore.list(12)
        },
        security: {
          remoteGuardEnabled: true,
          loopbackBypassEnabled: true,
          internalApiAuth: {
            enabled: internalApiKeys.size > 0,
            headerCount: internalApiKeys.size,
            headers: [...internalApiKeys.keys()]
          },
          trustedClient: {
            header: trustedClientHeader,
            allowedClients: [...trustedClientValues],
            allowedOriginCount: allowedOrigins.size
          },
          defensiveHeaders: {
            contentTypeOptions: 'nosniff',
            frameOptions: 'DENY',
            referrerPolicy: 'strict-origin-when-cross-origin',
            crossOriginOpenerPolicy: 'same-origin',
            crossOriginResourcePolicy: 'same-origin',
            hstsOnHttpsOnly: true
          },
          insecureDefaults: securityWarnings
        },
        calendar: {
          ...calendarStatus,
          upcomingEvents: upcomingCalendarEvents
        },
        paperAccount,
        paperAutonomy,
        ibkrRecovery,
        operationalReminder,
        training,
        research,
        learningPerformance,
        tradeLearning,
        selfLearning,
        learningCases,
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
    const events = (await listUpcomingEventsWithTimeout(calendarClient))
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

  app.get('/paper-autonomy/status', async (_request, reply) => {
    await syncPaperSessionState();
    return reply.status(200).send({
      paperAutonomy: paperAutonomyService ? paperAutonomyService.status() : { enabled: false, started: false }
    });
  });

  app.get('/paper-account/status', async (_request, reply) => {
    const paperAccount = await syncPaperSessionState();
    return reply.status(200).send({
      paperAccount: paperAccount ?? { enabled: false, started: false }
    });
  });

  app.patch('/paper-account/config', async (request, reply) => {
    const body = (request.body as {
      maxConcurrentTrades?: unknown;
      autonomyMode?: unknown;
      autonomyRiskPct?: unknown;
    } | undefined) ?? {};
    const maxConcurrentTrades =
      body.maxConcurrentTrades === undefined ? undefined : Number(body.maxConcurrentTrades);
    const autonomyMode =
      body.autonomyMode === 'FOLLOW_ALLOWED_ALERTS' || body.autonomyMode === 'UNRESTRICTED'
        ? body.autonomyMode
        : undefined;
    const autonomyRiskPct = body.autonomyRiskPct === undefined ? undefined : Number(body.autonomyRiskPct);
    if (!paperTradingService) {
      return reply.status(409).send({
        message: 'Paper trading is disabled'
      });
    }

    if (
      maxConcurrentTrades !== undefined
      && (!Number.isFinite(maxConcurrentTrades) || maxConcurrentTrades < 0 || maxConcurrentTrades > 50)
    ) {
      return reply.status(400).send({
        message: 'maxConcurrentTrades must be a number between 0 and 50'
      });
    }

    if (autonomyRiskPct !== undefined && (!Number.isFinite(autonomyRiskPct) || autonomyRiskPct < 0.01 || autonomyRiskPct > 5)) {
      return reply.status(400).send({
        message: 'autonomyRiskPct must be a number between 0.01 and 5'
      });
    }

    const paperAccount = await paperTradingService.updateConfig({
      ...(maxConcurrentTrades !== undefined ? { maxConcurrentTrades } : {}),
      ...(autonomyMode ? { autonomyMode } : {}),
      ...(autonomyRiskPct !== undefined ? { autonomyRiskPct } : {})
    });

    return reply.status(200).send({
      ok: true,
      paperAccount
    });
  });

  app.post('/paper-account/reset', async (_request, reply) => {
    const paperAccount = paperTradingService
      ? await paperTradingService.reset()
      : { enabled: false, started: false };
    const paperAutonomy = paperAutonomyService
      ? await paperAutonomyService.reset()
      : { enabled: false, started: false };

    return reply.status(200).send({
      ok: true,
      paperAccount,
      paperAutonomy
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

  app.get('/notifications/status', async (_request, reply) => {
    return reply.status(200).send({
      signalAlerts: {
        enabled: Boolean(signalMonitorService),
        started: signalMonitorService?.status().started ?? false,
        alertCount: signalMonitorService?.status().alertCount ?? 0,
        sourceLabel: 'Manual engine'
      },
      webPush: webPushNotificationService ? webPushNotificationService.status() : { enabled: false, ready: false, subscriberCount: 0 },
      nativePush: nativePushNotificationService
        ? nativePushNotificationService.status()
        : { enabled: false, ready: false, deviceCount: 0, environment: 'production' },
      telegram: telegramAlertService
        ? telegramAlertService.status()
        : { enabled: false, ready: false, chatConfigured: false }
    });
  });

  app.get('/notifications/activity', async (request, reply) => {
    await notificationActivityStore.start();
    const rawLimit = (request.query as { limit?: string | number } | undefined)?.limit;
    const parsedLimit =
      typeof rawLimit === 'number'
        ? rawLimit
        : typeof rawLimit === 'string'
          ? Number.parseInt(rawLimit, 10)
          : 20;
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(50, Math.round(parsedLimit))) : 20;

    return reply.status(200).send({
      activity: notificationActivityStore.list(limit)
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
        source: alert.source,
        title: alert.title,
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

  app.post('/notifications/test/research-experiment', async (request, reply) => {
    const body = (request.body as {
      symbol?: string;
      direction?: string;
      confidence?: number;
      thesis?: string;
      horizonMinutes?: number;
      delayMinutes?: number;
    } | undefined) ?? {};

    const symbol = body.symbol?.toUpperCase() === 'ES' ? 'ES' : 'NQ';
    const direction = body.direction?.toUpperCase() === 'BEARISH' ? 'BEARISH' : 'BULLISH';
    const confidence = typeof body.confidence === 'number' && Number.isFinite(body.confidence)
      ? Math.max(0, Math.min(1, body.confidence))
      : 0.74;
    const thesis = typeof body.thesis === 'string' && body.thesis.trim().length > 0
      ? body.thesis.trim()
      : `${symbol} aligned continuation`;
    const horizonMinutes =
      typeof body.horizonMinutes === 'number' && Number.isFinite(body.horizonMinutes)
        ? Math.max(5, Math.round(body.horizonMinutes))
        : 60;
    const confidenceLabel = `${Math.round(confidence * 100)}%`;
    const directionLabel = direction === 'BULLISH' ? 'bullish' : 'bearish';
    const delayMinutes = typeof body.delayMinutes === 'number' && Number.isFinite(body.delayMinutes)
      ? Math.max(0, body.delayMinutes)
      : 0;
    const changedAt = new Date(Date.now() - delayMinutes * 60_000).toISOString();
    const deliveryStatus = buildDeliveryFreshness(new Date().toISOString(), changedAt, 'research experiment');
    const summary = `${symbol} ${directionLabel} because ${thesis}`;

    const deliveries = await notifyTradeAssistChannels(
      {
        title: `Research experiment opened ${directionLabel}`,
        body: `${deliveryStatus.summary} • Thinking ${directionLabel} because ${thesis}`,
        url: '/mobile/?tab=home&focus=research-lab',
        tag: 'research-experiment-opened-test',
        category: 'engine-update',
        priority: 'low'
      },
      {
        title: `Research experiment opened ${directionLabel}`,
        lines: [
          deliveryStatus.line,
          `Thinking: ${summary}`,
          `Lead: ${symbol}`,
          `Confidence: ${confidenceLabel}`,
          `Horizon: ${horizonMinutes}m`,
          'Evidence: Controlled test notification from the research engine path.'
        ]
      }
    );

    return reply.status(200).send({
      ok: true,
      test: {
        symbol,
        direction,
        confidence,
        thesis,
        horizonMinutes,
        deliveryStatus: deliveryStatus.badge
      },
      deliveries
    });
  });

  app.post('/notifications/test/paper-trade', async (request, reply) => {
    const body = (request.body as {
      symbol?: string;
      side?: string;
      stage?: string;
      entry?: number;
      stop?: number;
      takeProfit?: number;
      pnl?: number;
      equity?: number;
      delayMinutes?: number;
    } | undefined) ?? {};

    const symbol = body.symbol?.toUpperCase() === 'ES' ? 'ES' : 'NQ';
    const side = body.side?.toUpperCase() === 'SELL' ? 'SELL' : 'BUY';
    const stage = body.stage?.toUpperCase() === 'CLOSED' ? 'CLOSED' : 'OPENED';
    const entry = typeof body.entry === 'number' && Number.isFinite(body.entry)
      ? body.entry
      : symbol === 'ES'
        ? 6542.25
        : 23864.5;
    const stop = typeof body.stop === 'number' && Number.isFinite(body.stop)
      ? body.stop
      : side === 'BUY'
        ? entry - (symbol === 'ES' ? 6 : 28)
        : entry + (symbol === 'ES' ? 6 : 28);
    const takeProfit = typeof body.takeProfit === 'number' && Number.isFinite(body.takeProfit)
      ? body.takeProfit
      : side === 'BUY'
        ? entry + (symbol === 'ES' ? 12 : 56)
        : entry - (symbol === 'ES' ? 12 : 56);
    const pnl = typeof body.pnl === 'number' && Number.isFinite(body.pnl)
      ? body.pnl
      : stage === 'CLOSED'
        ? (side === 'BUY' ? 375 : -225)
        : 0;
    const equity = typeof body.equity === 'number' && Number.isFinite(body.equity)
      ? body.equity
      : 100000 + pnl;
    const rrBase = Math.max(Math.abs(entry - stop), 0.01);
    const reward = Math.abs(takeProfit - entry);
    const riskReward = (reward / rrBase).toFixed(2);
    const directionLabel = side === 'BUY' ? 'long' : 'short';
    const delayMinutes = typeof body.delayMinutes === 'number' && Number.isFinite(body.delayMinutes)
      ? Math.max(0, body.delayMinutes)
      : 0;
    const occurredAt = new Date(Date.now() - delayMinutes * 60_000).toISOString();
    const deliveryStatus = buildPaperTradeDeliveryStatus({
      kind: stage === 'OPENED' ? 'TRADE_OPENED' : 'TRADE_CLOSED',
      at: new Date().toISOString(),
      trade: {
        submittedAt: occurredAt,
        filledAt: stage === 'OPENED' ? occurredAt : undefined,
        closedAt: stage === 'CLOSED' ? occurredAt : undefined
      } as PaperTradeEvent['trade']
    });

    const deliveries = await notifyTradeAssistChannels(
      {
        title: stage === 'OPENED' ? 'Paper trade opened' : 'Paper trade closed',
        body:
          stage === 'OPENED'
            ? `${deliveryStatus.summary} • ${symbol} ${directionLabel} • entry ${entry.toFixed(2)} • RR ${riskReward}`
            : `${deliveryStatus.summary} • ${symbol} ${directionLabel} • ${formatSignedUsd(pnl)} • equity ${formatUsd(equity)}`,
        url: '/mobile/?tab=trades',
        tag: `paper-trade-test-${stage.toLowerCase()}`,
        category: 'trade-activity',
        priority: 'normal'
      },
      {
        title: stage === 'OPENED' ? 'Paper trade opened' : 'Paper trade closed',
        lines:
          stage === 'OPENED'
            ? [
                deliveryStatus.line,
                `Symbol: ${symbol}`,
                `Side: ${directionLabel}`,
                `Entry: ${entry.toFixed(2)}`,
                `Stop: ${stop.toFixed(2)}`,
                `Take Profit: ${takeProfit.toFixed(2)}`,
                `Risk / Reward: ${riskReward}R`,
                'Source: Controlled paper-trade notification test'
              ]
            : [
                deliveryStatus.line,
                `Symbol: ${symbol}`,
                `Side: ${directionLabel}`,
                `Realized PnL: ${formatSignedUsd(pnl)}`,
                `Equity: ${formatUsd(equity)}`,
                'Source: Controlled paper-trade notification test'
              ]
      }
    );

    return reply.status(200).send({
      ok: true,
      test: {
        symbol,
        side,
        stage,
        entry,
        stop,
        takeProfit,
        pnl,
        equity,
        deliveryStatus: deliveryStatus.badge
      },
      deliveries
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
    const deliveryStatus = buildDeliveryFreshness(new Date().toISOString(), connectedAt, 'IBKR reconnect');
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
              body: `${deliveryStatus.summary} • ${bodyText}`,
              url: ibkrStatusUrl,
              tag: 'ibkr-connected',
              category: 'broker-recovery',
              priority: 'high'
            },
            {
              title,
              lines: [
                deliveryStatus.line,
                bodyText,
                `Source: ${source}`,
                `Connected at: ${connectedAt}`,
                yahooCutover.message
              ],
              buttons: [{ text: 'Open Status', url: ibkrStatusUrl }]
            },
            { telegramFallback: true }
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
    const deliveryStatus = buildDeliveryFreshness(new Date().toISOString(), detectedAt, 'IBKR login required');
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
              body: `${deliveryStatus.summary} • ${bodyText}`,
              url: ibkrStatusUrl,
              tag: 'ibkr-login-required',
              category: 'broker-recovery',
              priority: 'high'
            },
            {
              title,
              lines: [
                deliveryStatus.line,
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
            },
            { telegramFallback: true }
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
              tag: 'ibkr-fallback-activated',
              category: 'broker-recovery',
              priority: 'high'
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
            },
            { telegramFallback: true }
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Native push registration failed') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Native push unregister failed') });
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
        platform: body.platform,
        notificationPrefs: body.notificationPrefs
      });
      return reply.status(200).send({
        ok: true,
        webPush: webPushNotificationService.status()
      });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Web push subscription failed') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Web push unsubscribe failed') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Invalid risk check request') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Invalid risk config patch') });
    }
  });

  app.post('/execution/propose', async (request, reply) => {
    try {
      const body = parseOrThrow(executionProposeBodySchema.safeParse(request.body));
      const intent = executionService.propose(body.candidate, body.riskDecision, body.now);
      return reply.status(200).send({ intent });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Execution proposal failed') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Execution approval failed') });
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
      if (!continuousTrainingService && !signalMonitorService && !marketResearchService && !paperTradingService && !paperAutonomyService) {
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
      const paperAutonomyIngest = paperAutonomyService
        ? await paperAutonomyService.ingestBars(body.bars)
        : { accepted: 0, ideasOpened: 0 };
      const paperIngest = paperTradingService ? await paperTradingService.ingestBars(body.bars) : { accepted: 0, settled: 0 };
      return reply.status(200).send({
        ingest,
        signalMonitor: signalMonitorService ? signalMonitorService.status() : { enabled: false, started: false },
        signalIngest,
        research: marketResearchService ? marketResearchService.status() : { enabled: false, started: false },
        researchIngest,
        paperAutonomy: paperAutonomyService ? paperAutonomyService.status() : { enabled: false, started: false },
        paperAutonomyIngest,
        paperAccount: paperTradingService ? paperTradingService.status() : { enabled: false, started: false },
        paperIngest,
        training: continuousTrainingService
          ? continuousTrainingService.status()
          : { enabled: false, started: false }
      });
    } catch (error) {
      return reply.status(400).send({ message: safeErrorMessage(error, 'Training ingest failed') });
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
      return reply.status(400).send({ message: safeErrorMessage(error, 'Manual retrain failed') });
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
    tradeLearningStore,
    selfLearningService,
    nativePushNotificationService,
    webPushNotificationService,
    telegramAlertService,
    notificationActivityStore,
    operationalReminderService,
    marketResearchService,
    paperTradingService,
    paperAutonomyService
  };
};
