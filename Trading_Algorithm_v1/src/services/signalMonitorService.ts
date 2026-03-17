import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type {
  AccountSnapshot,
  Candle,
  MarketConditions,
  RiskConfig,
  SignalReviewOutcome,
  SignalReviewEntry,
  SignalChartSnapshot,
  SignalMonitorSettings,
  SetupCandidate,
  SignalAlert,
  SignalGenerationInput,
  SymbolCode
} from '../domain/types.js';
import { generateSetupCandidates } from '../domain/setupDetectors.js';
import type { EconomicCalendarClient } from '../integrations/news/EconomicCalendarClient.js';
import {
  parseOneMinuteCsv,
  aggregateBars,
  labelCandidateFromFutureCandles5m,
  type OneMinuteBar
} from '../training/historicalTrainer.js';
import { rankCandidates } from './ranker.js';
import type { RankingModelStore } from './rankingModelStore.js';
import { evaluateRisk } from './riskEngine.js';
import type { ExecutionService } from './executionService.js';
import type { JournalStore } from '../stores/journalStore.js';
import type { SignalReviewStore } from '../stores/signalReviewStore.js';
import type { NativePushNotificationService } from './nativePushNotificationService.js';
import type { TelegramAlertService } from './telegramAlertService.js';
import type { WebPushNotificationService } from './webPushNotificationService.js';

interface LocalTimeParts {
  dayKey: string;
  minuteOfDay: number;
}

interface SignalMonitorConfig {
  enabled: boolean;
  lookbackBars1m: number;
  outcomeLookaheadBars1m: number;
  bootstrapCsvDir?: string;
  bootstrapRecursive: boolean;
  archivePath?: string;
  maxBarsPerSymbol: number;
  maxAlerts: number;
  escalationCheckIntervalMs: number;
  escalationDelaysMs: number[];
  accountSnapshot: AccountSnapshot;
  marketConditions: MarketConditions;
}

export interface SignalMonitorStatus {
  enabled: boolean;
  started: boolean;
  alertCount: number;
  lastAlertAt?: string;
  latestBarTimestampBySymbol: Partial<Record<SymbolCode, string>>;
  lastError?: string;
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
const getFormatter = (timezone: string): Intl.DateTimeFormat => {
  const cached = dtfCache.get(timezone);
  if (cached) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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

const getLocalTimeParts = (timestamp: string, timezone: string): LocalTimeParts => {
  const formatter = getFormatter(timezone);
  const parts = formatter.formatToParts(new Date(timestamp));
  const find = (type: Intl.DateTimeFormatPartTypes): string => {
    const part = parts.find((entry) => entry.type === type);
    return part ? part.value : '00';
  };

  const year = find('year');
  const month = find('month');
  const day = find('day');
  const hour = Number(find('hour'));
  const minute = Number(find('minute'));

  return {
    dayKey: `${year}-${month}-${day}`,
    minuteOfDay: hour * 60 + minute
  };
};

const inWindow = (minuteOfDay: number, startMinute: number, endMinute: number): boolean =>
  minuteOfDay >= startMinute && minuteOfDay <= endMinute;

const barToCandle = (bar: OneMinuteBar): Candle => ({
  timestamp: bar.timestamp,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume
});

const takeLast = <T>(items: T[], count: number): T[] =>
  items.length <= count ? items : items.slice(items.length - count);

const listCsvFiles = async (dirPath: string, recursive: boolean): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        const nested = await listCsvFiles(fullPath, true);
        for (const file of nested) {
          files.push(file);
        }
      }
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      files.push(fullPath);
    }
  }

  return files;
};

const isIntervalClosed = (timestamp: string, intervalMinutes: number): boolean => {
  const minuteNumber = Math.floor(Date.parse(timestamp) / 60_000);
  return (minuteNumber + 1) % intervalMinutes === 0;
};

const completeCandles = (
  bars: OneMinuteBar[],
  nowTimestamp: string,
  intervalMinutes: number,
  tailCount: number
): Candle[] => {
  let candles = aggregateBars(bars, intervalMinutes);
  if (!isIntervalClosed(nowTimestamp, intervalMinutes) && candles.length > 0) {
    candles = candles.slice(0, -1);
  }
  return takeLast(candles, tailCount);
};

const summarizeCandidate = (candidate: SetupCandidate): string => {
  const score =
    typeof candidate.finalScore === 'number' ? `score ${candidate.finalScore.toFixed(1)}` : 'unscored';
  return `${candidate.symbol} ${candidate.side} • ${candidate.setupType} • ${score}`;
};

const createChartSnapshot = (
  candles5m: Candle[],
  candidate: SetupCandidate,
  sessionLevels: SignalGenerationInput['sessionLevels']
): SignalChartSnapshot | undefined => {
  const bars = takeLast(candles5m, 18);
  if (bars.length < 4) {
    return undefined;
  }

  return {
    timeframe: '5m',
    bars,
    levels: {
      entry: candidate.entry,
      stopLoss: candidate.stopLoss,
      takeProfit: candidate.takeProfit[0],
      sessionHigh: sessionLevels.high,
      sessionLow: sessionLevels.low,
      nyRangeHigh: sessionLevels.nyRangeHigh,
      nyRangeLow: sessionLevels.nyRangeLow
    }
  };
};

export class SignalMonitorService {
  private started = false;
  private lastError: string | undefined;
  private alerts: SignalAlert[] = [];
  private barKeys = new Set<string>();
  private barsBySymbol = new Map<SymbolCode, OneMinuteBar[]>();
  private alertKeys = new Set<string>();
  private lastAlertAt: string | undefined;
  private escalationInterval: NodeJS.Timeout | undefined;

  constructor(
    private readonly rankingModelStore: RankingModelStore,
    private readonly journalStore: JournalStore,
    private readonly calendarClient: EconomicCalendarClient,
    private readonly executionService: ExecutionService,
    private readonly getRiskConfig: () => RiskConfig,
    private readonly config: SignalMonitorConfig,
    private readonly getSettings: () => SignalMonitorSettings,
    private readonly signalReviewStore: SignalReviewStore,
    private readonly nativePushNotificationService?: NativePushNotificationService | null,
    private readonly webPushNotificationService?: WebPushNotificationService | null,
    private readonly telegramAlertService?: TelegramAlertService | null
  ) {}

  async start(): Promise<void> {
    if (!this.config.enabled || this.started) {
      return;
    }
    this.started = true;

    try {
      await this.loadBootstrapCsv();
      await this.loadArchiveBars();
      this.startEscalationLoop();
      this.lastError = undefined;
    } catch (error) {
      this.lastError = (error as Error).message;
    }
  }

  stop(): void {
    this.started = false;
    if (this.escalationInterval) {
      clearInterval(this.escalationInterval);
      this.escalationInterval = undefined;
    }
  }

  status(): SignalMonitorStatus {
    const enabledSymbols = new Set(this.getSettings().enabledSymbols);
    const latestBarTimestampBySymbol: Partial<Record<SymbolCode, string>> = {};
    for (const [symbol, bars] of this.barsBySymbol.entries()) {
      if (enabledSymbols.size > 0 && !enabledSymbols.has(symbol)) {
        continue;
      }
      const latest = bars[bars.length - 1];
      if (latest) {
        latestBarTimestampBySymbol[symbol] = latest.timestamp;
      }
    }

    return {
      enabled: this.config.enabled,
      started: this.started,
      alertCount: this.alerts.length,
      lastAlertAt: this.lastAlertAt,
      latestBarTimestampBySymbol,
      lastError: this.lastError
    };
  }

  listAlerts(limit = 50): SignalAlert[] {
    return this.alerts.slice(0, Math.max(1, limit));
  }

  async triggerTestAlert(symbol: SymbolCode = 'NQ'): Promise<SignalAlert> {
    const activeModel = this.rankingModelStore.get();
    const symbolBars = this.barsBySymbol.get(symbol) ?? [];
    const latestBar = symbolBars[symbolBars.length - 1];
    const detectedAt = latestBar?.timestamp ?? new Date().toISOString();
    const referencePrice = latestBar?.close ?? (symbol === 'ES' ? 6_000 : symbol === 'YM' ? 42_000 : 21_000);
    const side = symbol === 'YM' ? 'SHORT' : 'LONG';
    const direction = side === 'LONG' ? 1 : -1;
    const entry = Number((referencePrice + direction * 4).toFixed(2));
    const stopLoss = Number((entry - direction * 20).toFixed(2));
    const takeProfit = [Number((entry + direction * 36).toFixed(2))];
    const generatedAt = new Date().toISOString();

    const candidate: SetupCandidate = {
      id: uuidv4(),
      setupType: 'NY_BREAK_RETEST_MOMENTUM',
      symbol,
      session: 'NY',
      detectionTimeframe: '15m',
      executionTimeframe: '5m',
      side,
      entry,
      stopLoss,
      takeProfit,
      baseScore: 84,
      oneMinuteConfidence: 0.78,
      finalScore: 88,
      eligibility: {
        passed: true,
        passReasons: ['manual_test_alert'],
        failReasons: []
      },
      metadata: {
        regimeScore: side === 'LONG' ? 0.41 : -0.41,
        sweepLevel: Number((referencePrice - direction * 10).toFixed(2)),
        mssBreakReference: Number((referencePrice + direction * 6).toFixed(2)),
        orderBlockLevel: Number((referencePrice - direction * 3).toFixed(2)),
        brokenRangeLevel: Number((referencePrice + direction * 2).toFixed(2)),
        source: 'manual-test'
      },
      generatedAt
    };

    const riskDecision = evaluateRisk(
      {
        candidate,
        account: this.config.accountSnapshot,
        market: this.config.marketConditions,
        now: detectedAt,
        newsEvents: []
      },
      this.getRiskConfig()
    );

    let executionIntentId: string | undefined;
    if (riskDecision.allowed) {
      const intent = this.executionService.propose(candidate, riskDecision, detectedAt);
      executionIntentId = intent.intentId;
    }

    const recentBars = takeLast(symbolBars, 120);
    const candles5m = recentBars.length > 0 ? completeCandles(recentBars, detectedAt, 5, 40) : [];
    const levelBars = recentBars.length > 0 ? recentBars : undefined;
    const sessionLevels = {
      high: levelBars ? Math.max(...levelBars.map((bar) => bar.high)) : Number((referencePrice + 24).toFixed(2)),
      low: levelBars ? Math.min(...levelBars.map((bar) => bar.low)) : Number((referencePrice - 24).toFixed(2)),
      nyRangeHigh: levelBars ? Math.max(...levelBars.map((bar) => bar.high)) : Number((referencePrice + 14).toFixed(2)),
      nyRangeLow: levelBars ? Math.min(...levelBars.map((bar) => bar.low)) : Number((referencePrice - 14).toFixed(2))
    };

    this.journalStore.addEvent({
      type: 'SIGNAL_GENERATED',
      timestamp: detectedAt,
      candidateId: candidate.id,
      symbol,
      payload: {
        candidateCount: 1,
        setupTypes: [candidate.setupType],
        source: 'manual-test'
      }
    });

    this.journalStore.addEvent({
      type: 'SIGNAL_RANKED',
      timestamp: detectedAt,
      candidateId: candidate.id,
      symbol,
      payload: {
        rankedCount: 1,
        topCandidateId: candidate.id,
        topFinalScore: candidate.finalScore ?? null,
        rankingModelId: activeModel.modelId,
        source: 'manual-test'
      }
    });

    this.journalStore.addEvent({
      type: 'RISK_CHECKED',
      timestamp: detectedAt,
      candidateId: candidate.id,
      symbol,
      payload: {
        allowed: riskDecision.allowed,
        reasonCodes: riskDecision.reasonCodes,
        finalRiskPct: riskDecision.finalRiskPct,
        source: 'manual-test'
      }
    });

    const alert: SignalAlert = {
      alertId: uuidv4(),
      symbol: candidate.symbol,
      setupType: candidate.setupType,
      side: candidate.side,
      detectedAt,
      rankingModelId: activeModel.modelId,
      executionIntentId,
      title: `${candidate.symbol} ${candidate.side} test signal`,
      summary: 'Manual signal-path verification alert',
      candidate,
      riskDecision,
      chartSnapshot: createChartSnapshot(candles5m, candidate, sessionLevels)
    };

    await this.publishAlert(alert, {
      timestamp: detectedAt,
      candidateId: candidate.id,
      symbol,
      executionIntentId,
      finalScore: candidate.finalScore ?? null,
      source: 'manual-test'
    });

    return alert;
  }

  private startEscalationLoop(): void {
    if (this.escalationInterval || this.config.escalationDelaysMs.length === 0) {
      return;
    }

    this.escalationInterval = setInterval(() => {
      void this.processEscalations();
    }, this.config.escalationCheckIntervalMs);
  }

  private async processEscalations(): Promise<void> {
    if (!this.started) {
      return;
    }

    const pending = await this.signalReviewStore.listPendingAcknowledgements(this.config.maxAlerts);
    if (pending.length === 0) {
      return;
    }

    const nowMs = Date.now();
    for (const review of pending) {
      const nextEscalationIndex = review.escalationCount ?? 0;
      const thresholdMs = this.config.escalationDelaysMs[nextEscalationIndex];
      if (thresholdMs === undefined) {
        continue;
      }

      const detectedMs = Date.parse(review.detectedAt);
      if (!Number.isFinite(detectedMs) || nowMs - detectedMs < thresholdMs) {
        continue;
      }

      const updated = await this.signalReviewStore.recordEscalation(review.alertId);
      const escalatedAlert: SignalAlert = {
        ...updated.alertSnapshot,
        reviewState: {
          reviewStatus: updated.reviewStatus,
          acknowledgedAt: updated.acknowledgedAt,
          acknowledgedBy: updated.acknowledgedBy,
          escalationCount: updated.escalationCount,
          lastEscalatedAt: updated.lastEscalatedAt,
          reviewedAt: updated.reviewedAt,
          validity: updated.validity,
          outcome: updated.outcome
        }
      };

      await this.notifyAlertChannels(escalatedAlert, {
        reason: 'reminder',
        reminderCount: updated.escalationCount
      });
    }
  }

  private resolveAutoOutcome(review: SignalReviewEntry | undefined, symbolBars: OneMinuteBar[]):
    | { outcome: SignalReviewOutcome; labeledAt: string }
    | undefined {
    if (!review || review.outcome || review.autoOutcome) {
      return undefined;
    }

    const detectedIndex = symbolBars.findIndex((bar) => bar.timestamp >= review.detectedAt);
    if (detectedIndex < 0) {
      return undefined;
    }

    const futureBars = symbolBars.slice(
      detectedIndex + 1,
      detectedIndex + 1 + this.config.outcomeLookaheadBars1m
    );
    if (futureBars.length === 0) {
      return undefined;
    }

    const futureCandles5m = aggregateBars(futureBars, 5);
    const outcome = labelCandidateFromFutureCandles5m(review.alertSnapshot.candidate, futureCandles5m);
    if (outcome === 'WIN') {
      return {
        outcome: 'WOULD_WIN',
        labeledAt: futureBars[futureBars.length - 1].timestamp
      };
    }
    if (outcome === 'LOSS') {
      return {
        outcome: 'WOULD_LOSE',
        labeledAt: futureBars[futureBars.length - 1].timestamp
      };
    }
    if (futureBars.length >= this.config.outcomeLookaheadBars1m) {
      return {
        outcome: 'BREAKEVEN',
        labeledAt: futureBars[futureBars.length - 1].timestamp
      };
    }

    return undefined;
  }

  private async processAutomaticLearningOutcomes(symbol: SymbolCode): Promise<void> {
    const symbolBars = this.barsBySymbol.get(symbol);
    if (!symbolBars || symbolBars.length < 2) {
      return;
    }

    const reviews = await this.signalReviewStore.listAllReviews();
    const pending = reviews.filter(
      (review) => review.symbol === symbol && !review.outcome && !review.autoOutcome
    );

    for (const review of pending) {
      const resolved = this.resolveAutoOutcome(review, symbolBars);
      if (!resolved) {
        continue;
      }

      const updated = await this.signalReviewStore.applyAutoOutcome(
        review.alertId,
        resolved.outcome,
        resolved.labeledAt
      );

      this.journalStore.addEvent({
        type: 'SIGNAL_AUTO_LABELED',
        timestamp: resolved.labeledAt,
        candidateId: updated.candidateId,
        symbol: updated.symbol,
        payload: {
          alertId: updated.alertId,
          autoOutcome: updated.autoOutcome ?? null,
          effectiveOutcome: updated.effectiveOutcome ?? null,
          autoLabeledAt: updated.autoLabeledAt ?? null
        }
      });
    }
  }

  async ingestBars(rawBars: OneMinuteBar[]): Promise<{ accepted: number }> {
    if (!this.config.enabled || rawBars.length === 0) {
      return { accepted: 0 };
    }

    const accepted = rawBars
      .slice()
      .sort((a, b) => {
        const bySymbol = a.symbol.localeCompare(b.symbol);
        if (bySymbol !== 0) {
          return bySymbol;
        }
        return a.timestamp.localeCompare(b.timestamp);
      })
      .filter((bar) => {
        const key = `${bar.symbol}|${bar.timestamp}`;
        if (this.barKeys.has(key)) {
          return false;
        }
        this.barKeys.add(key);
        return true;
      });

    for (const bar of accepted) {
      const existing = this.barsBySymbol.get(bar.symbol) ?? [];
      existing.push(bar);
      existing.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      while (existing.length > this.config.maxBarsPerSymbol) {
        const removed = existing.shift();
        if (removed) {
          this.barKeys.delete(`${removed.symbol}|${removed.timestamp}`);
        }
      }

      this.barsBySymbol.set(bar.symbol, existing);
      await this.evaluateSymbolAtBar(bar.symbol, bar.timestamp);
      await this.processAutomaticLearningOutcomes(bar.symbol);
    }

    return { accepted: accepted.length };
  }

  private async loadBootstrapCsv(): Promise<void> {
    if (!this.config.bootstrapCsvDir) {
      return;
    }

    const exists = await fs
      .stat(this.config.bootstrapCsvDir)
      .then((stats) => stats.isDirectory())
      .catch(() => false);
    if (!exists) {
      return;
    }

    const files = await listCsvFiles(this.config.bootstrapCsvDir, this.config.bootstrapRecursive);
    for (const file of files) {
      const raw = await fs.readFile(file, 'utf8');
      const bars = parseOneMinuteCsv(raw);
      await this.ingestBootstrapBars(bars);
    }
  }

  private async loadArchiveBars(): Promise<void> {
    if (!this.config.archivePath) {
      return;
    }

    const exists = await fs
      .stat(this.config.archivePath)
      .then((stats) => stats.isFile())
      .catch(() => false);
    if (!exists) {
      return;
    }

    const raw = await fs.readFile(this.config.archivePath, 'utf8');
    const bars: OneMinuteBar[] = [];
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as OneMinuteBar;
        bars.push(parsed);
      } catch {
        // Ignore malformed archive rows.
      }
    }

    await this.ingestBootstrapBars(bars);
  }

  private async ingestBootstrapBars(bars: OneMinuteBar[]): Promise<void> {
    const grouped = new Map<SymbolCode, OneMinuteBar[]>();
    for (const bar of bars) {
      const arr = grouped.get(bar.symbol);
      if (arr) {
        arr.push(bar);
      } else {
        grouped.set(bar.symbol, [bar]);
      }
    }

    for (const [symbol, symbolBars] of grouped.entries()) {
      const sorted = symbolBars.slice().sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const keep = takeLast(sorted, this.config.maxBarsPerSymbol);
      this.barsBySymbol.set(symbol, keep);
      for (const bar of keep) {
        this.barKeys.add(`${bar.symbol}|${bar.timestamp}`);
      }
    }
  }

  private async evaluateSymbolAtBar(symbol: SymbolCode, timestamp: string): Promise<void> {
    const settings = this.getSettings();
    if (!settings.enabledSymbols.includes(symbol)) {
      return;
    }

    const symbolBars = this.barsBySymbol.get(symbol);
    if (!symbolBars || symbolBars.length < this.config.lookbackBars1m) {
      return;
    }

    const currentIndex = symbolBars.findIndex((bar) => bar.timestamp === timestamp);
    if (currentIndex < 0) {
      return;
    }

    const currentBar = symbolBars[currentIndex];
    if (!isIntervalClosed(currentBar.timestamp, 5)) {
      return;
    }

    const barsUntilNow = symbolBars.slice(0, currentIndex + 1);
    const sessionStart = settings.sessionStartHour * 60 + settings.sessionStartMinute;
    const sessionEnd = settings.sessionEndHour * 60 + settings.sessionEndMinute;
    const rangeEnd = sessionStart + settings.nyRangeMinutes;
    const localNow = getLocalTimeParts(currentBar.timestamp, settings.timezone);

    if (!inWindow(localNow.minuteOfDay, sessionStart, sessionEnd)) {
      return;
    }

    if (settings.requireOpeningRangeComplete && localNow.minuteOfDay < rangeEnd) {
      return;
    }

    const candles1m = takeLast(barsUntilNow, this.config.lookbackBars1m).map(barToCandle);
    if (candles1m.length < this.config.lookbackBars1m) {
      return;
    }

    const candles5m = completeCandles(barsUntilNow, currentBar.timestamp, 5, 20);
    const candles15m = completeCandles(barsUntilNow, currentBar.timestamp, 15, 20);
    const candles1H = completeCandles(barsUntilNow, currentBar.timestamp, 60, 20);
    const candles4H = completeCandles(barsUntilNow, currentBar.timestamp, 240, 20);
    const candlesD1 = completeCandles(barsUntilNow, currentBar.timestamp, 1440, 20);
    const candlesW1 = completeCandles(barsUntilNow, currentBar.timestamp, 10080, 20);

    if (candles5m.length < 3 || candles15m.length < 5) {
      return;
    }

    const dayScan = takeLast(barsUntilNow, 12 * 60);
    const sessionBarsToday = dayScan.filter((bar) => {
      const local = getLocalTimeParts(bar.timestamp, settings.timezone);
      return local.dayKey === localNow.dayKey && inWindow(local.minuteOfDay, sessionStart, sessionEnd);
    });

    if (sessionBarsToday.length < 30) {
      return;
    }

    const latest15mStart = candles15m[candles15m.length - 1]?.timestamp;
    const priorSessionBars =
      latest15mStart === undefined
        ? sessionBarsToday
        : sessionBarsToday.filter((bar) => bar.timestamp < latest15mStart);
    const sessionLevelBars = priorSessionBars.length > 0 ? priorSessionBars : sessionBarsToday;

    const nyRangeBars = sessionBarsToday.filter((bar) => {
      const local = getLocalTimeParts(bar.timestamp, settings.timezone);
      return local.minuteOfDay <= rangeEnd;
    });
    const nyRangeSource = nyRangeBars.length > 0 ? nyRangeBars : sessionBarsToday;

    const input: SignalGenerationInput = {
      symbol,
      session: 'NY',
      now: currentBar.timestamp,
      timeframeData: {
        '1m': candles1m,
        '5m': candles5m,
        '15m': candles15m,
        '1H': candles1H,
        '4H': candles4H,
        D1: candlesD1,
        W1: candlesW1
      },
      sessionLevels: {
        high: Math.max(...sessionLevelBars.map((bar) => bar.high)),
        low: Math.min(...sessionLevelBars.map((bar) => bar.low)),
        nyRangeHigh: Math.max(...nyRangeSource.map((bar) => bar.high)),
        nyRangeLow: Math.min(...nyRangeSource.map((bar) => bar.low))
      }
    };

    const candidates = generateSetupCandidates(input).filter((candidate) =>
      settings.enabledSetups.includes(candidate.setupType)
    );
    if (candidates.length === 0) {
      return;
    }

    this.journalStore.addEvent({
      type: 'SIGNAL_GENERATED',
      timestamp: currentBar.timestamp,
      symbol,
      payload: {
        candidateCount: candidates.length,
        setupTypes: candidates.map((candidate) => candidate.setupType),
        source: 'signal-monitor'
      }
    });

    const activeModel = this.rankingModelStore.get();
    const ranked = rankCandidates({ candidates }, activeModel);
    const minScoreThreshold =
      settings.aPlusOnlyAfterFirstHour && localNow.minuteOfDay >= rangeEnd
        ? Math.max(settings.minFinalScore, settings.aPlusMinScore)
        : settings.minFinalScore;
    const qualifyingCandidates = ranked.filter((candidate) => (candidate.finalScore ?? 0) >= minScoreThreshold);
    const topCandidate = qualifyingCandidates[0];
    if (!topCandidate) {
      return;
    }

    this.journalStore.addEvent({
      type: 'SIGNAL_RANKED',
      timestamp: currentBar.timestamp,
      candidateId: topCandidate.id,
      symbol,
      payload: {
        rankedCount: ranked.length,
        qualifyingCount: qualifyingCandidates.length,
        topCandidateId: topCandidate.id,
        topFinalScore: topCandidate.finalScore ?? null,
        rankingModelId: activeModel.modelId,
        source: 'signal-monitor'
      }
    });
    const newsEvents = await this.calendarClient.listUpcomingEvents();

    for (const candidate of qualifyingCandidates) {
      const alertKey = `${candidate.symbol}|${candidate.setupType}|${candidate.side}|${candidate.generatedAt}`;
      if (this.alertKeys.has(alertKey)) {
        continue;
      }
      this.alertKeys.add(alertKey);

      const riskDecision = evaluateRisk(
        {
          candidate,
          account: this.config.accountSnapshot,
          market: this.config.marketConditions,
          now: currentBar.timestamp,
          newsEvents
        },
        this.getRiskConfig()
      );

      this.journalStore.addEvent({
        type: 'RISK_CHECKED',
        timestamp: currentBar.timestamp,
        candidateId: candidate.id,
        symbol,
        payload: {
          allowed: riskDecision.allowed,
          reasonCodes: riskDecision.reasonCodes,
          finalRiskPct: riskDecision.finalRiskPct,
          source: 'signal-monitor'
        }
      });

      let executionIntentId: string | undefined;
      if (riskDecision.allowed) {
        const intent = this.executionService.propose(candidate, riskDecision, currentBar.timestamp);
        executionIntentId = intent.intentId;
      }

      const alert: SignalAlert = {
        alertId: uuidv4(),
        symbol: candidate.symbol,
        setupType: candidate.setupType,
        side: candidate.side,
        detectedAt: currentBar.timestamp,
        rankingModelId: activeModel.modelId,
        executionIntentId,
        title: `${candidate.symbol} ${candidate.side} signal`,
        summary: summarizeCandidate(candidate),
        candidate,
        riskDecision,
        chartSnapshot: createChartSnapshot(candles5m, candidate, input.sessionLevels)
      };

      await this.publishAlert(alert, {
        timestamp: currentBar.timestamp,
        candidateId: candidate.id,
        symbol,
        executionIntentId,
        finalScore: candidate.finalScore ?? null,
        source: 'signal-monitor'
      });
    }
  }

  private async publishAlert(
    alert: SignalAlert,
    context: {
      timestamp: string;
      candidateId: string;
      symbol: SymbolCode;
      executionIntentId?: string;
      finalScore: number | null;
      source: string;
    }
  ): Promise<void> {
    this.alerts.unshift(alert);
    this.alerts = this.alerts.slice(0, this.config.maxAlerts);
    this.lastAlertAt = alert.detectedAt;

    this.journalStore.addEvent({
      type: 'SIGNAL_ALERTED',
      timestamp: context.timestamp,
      candidateId: context.candidateId,
      symbol: context.symbol,
      payload: {
        alertId: alert.alertId,
        executionIntentId: context.executionIntentId,
        finalScore: context.finalScore,
        source: context.source
      }
    });

    const reviewEntry = await this.signalReviewStore.recordAlert(alert);
    alert.reviewState = {
      reviewStatus: reviewEntry.reviewStatus,
      acknowledgedAt: reviewEntry.acknowledgedAt,
      acknowledgedBy: reviewEntry.acknowledgedBy,
      escalationCount: reviewEntry.escalationCount,
      lastEscalatedAt: reviewEntry.lastEscalatedAt,
      reviewedAt: reviewEntry.reviewedAt,
      validity: reviewEntry.validity,
      outcome: reviewEntry.outcome
    };

    await this.notifyAlertChannels(alert, {
      reason: 'initial',
      reminderCount: alert.reviewState?.escalationCount ?? 0
    });
  }

  private async notifyAlertChannels(
    alert: SignalAlert,
    delivery: {
      reason: 'initial' | 'reminder';
      reminderCount: number;
    }
  ): Promise<void> {
    if (this.nativePushNotificationService) {
      try {
        await this.nativePushNotificationService.notifySignalAlert(alert);
      } catch (error) {
        this.lastError = (error as Error).message;
      }
    }

    if (this.webPushNotificationService) {
      try {
        await this.webPushNotificationService.notifySignalAlert(alert, delivery);
      } catch (error) {
        this.lastError = (error as Error).message;
      }
    }

    if (this.telegramAlertService) {
      try {
        await this.telegramAlertService.notifySignalAlert(alert, delivery);
      } catch (error) {
        this.lastError = (error as Error).message;
      }
    }
  }
}
