import { setTimeout as sleep } from 'node:timers/promises';
import type { SymbolCode } from '../../domain/types.js';
import { getYahooJson } from './yahooHttpClient.js';

export interface YahooOneMinuteBar {
  symbol: SymbolCode;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface YahooLiveBridgeConfig {
  enabled: boolean;
  symbols: string[];
  symbolMap: Partial<Record<string, SymbolCode>>;
  interval: string;
  range: string;
  pollIntervalMs: number;
  overlapSeconds: number;
  maxBarsPerIngest: number;
  yahooBaseUrl: string;
  userAgent: string;
  requestRetries: number;
  forceCurl: boolean;
  trainingApiBaseUrl: string;
  trainingApiKey?: string;
  trainingApiKeyHeader: string;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  logPrefix: string;
}

export interface YahooLiveBridgeStatus {
  enabled: boolean;
  running: boolean;
  lastError?: string;
  lastPollAt?: string;
  lastIngestAt?: string;
  polls: number;
  ingestCalls: number;
  ingestedBars: number;
  reconnectAttempts: number;
  trackedSymbols: Array<{
    sourceSymbol: string;
    lastEmittedTimestamp?: string;
  }>;
}

const defaultSymbolAliases: Record<string, SymbolCode> = {
  '^NDX': 'NAS100',
  '^GSPC': 'ES',
  '^DJI': 'US30',
  'NQ=F': 'NQ',
  'ES=F': 'ES',
  'YM=F': 'YM',
  'MNQ=F': 'MNQ',
  'MYM=F': 'MYM',
  NAS100: 'NAS100',
  US30: 'US30',
  US100: 'NAS100',
  USTEC: 'NAS100',
  ES: 'ES',
  MES: 'ES',
  SPY: 'ES',
  SPX: 'ES',
  GSPC: 'ES',
  US500: 'ES',
  DJ30: 'US30',
  DJI: 'US30',
  NQ: 'NQ',
  YM: 'YM',
  MNQ: 'MNQ',
  MYM: 'MYM'
};

const parseIntervalMinutes = (raw: string): number => {
  const value = raw.trim().toLowerCase();
  if (value.endsWith('m')) {
    const parsed = Number.parseInt(value.slice(0, -1), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }
  if (value.endsWith('h')) {
    const parsed = Number.parseInt(value.slice(0, -1), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed * 60 : 60;
  }
  return 1;
};

const toFiniteNumber = (raw: unknown): number | null =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : null;

const toIsoFromEpochSeconds = (raw: unknown): string | null => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return null;
  }
  return new Date(raw * 1000).toISOString();
};

const tokenizeSymbol = (raw: string): string[] =>
  raw
    .toUpperCase()
    .split(/[^A-Z0-9^=]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const inferSymbol = (raw: string): SymbolCode | null => {
  const tokens = tokenizeSymbol(raw);
  const candidates = tokens.length > 0 ? tokens : [raw.toUpperCase()];
  const priority = ['MNQ=F', 'MYM=F', '^NDX', '^GSPC', '^DJI', 'ES=F', 'MNQ', 'MYM', 'NAS100', 'US30', 'ES', 'MES', 'SPY', 'SPX', 'GSPC', 'US500', 'NQ', 'YM'];

  for (const token of candidates) {
    for (const key of priority) {
      if (token === key || token.startsWith(key)) {
        return defaultSymbolAliases[key];
      }
    }
  }
  return null;
};

export const mapYahooSymbol = (
  sourceSymbol: string,
  customMap: Partial<Record<string, SymbolCode>> = {}
): SymbolCode | null => {
  const normalized = sourceSymbol.trim().toUpperCase();
  if (normalized.length === 0) {
    return null;
  }
  const exactCustom = customMap[normalized];
  if (exactCustom) {
    return exactCustom;
  }
  if (normalized in defaultSymbolAliases) {
    return defaultSymbolAliases[normalized as keyof typeof defaultSymbolAliases];
  }
  return inferSymbol(normalized);
};

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
      };
      timestamp?: Array<number | null>;
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: {
      code?: string;
      description?: string;
    } | null;
  };
}

export const parseYahooChartResponse = (
  payload: unknown,
  requestedSymbol: string,
  symbolMap: Partial<Record<string, SymbolCode>> = {}
): YahooOneMinuteBar[] => {
  const chart = (payload as YahooChartResponse)?.chart;
  const result = chart?.result?.[0];
  if (!result) {
    return [];
  }

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || timestamps.length === 0) {
    return [];
  }

  const resolvedSourceSymbol = result.meta?.symbol ?? requestedSymbol;
  const mappedSymbol =
    mapYahooSymbol(resolvedSourceSymbol, symbolMap) ??
    mapYahooSymbol(requestedSymbol, symbolMap);
  if (!mappedSymbol) {
    return [];
  }

  const bars: YahooOneMinuteBar[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const timestamp = toIsoFromEpochSeconds(timestamps[i]);
    if (!timestamp) {
      continue;
    }
    const open = toFiniteNumber(quote.open?.[i]);
    const high = toFiniteNumber(quote.high?.[i]);
    const low = toFiniteNumber(quote.low?.[i]);
    const close = toFiniteNumber(quote.close?.[i]);

    if (open === null || high === null || low === null || close === null) {
      continue;
    }

    const volumeValue = toFiniteNumber(quote.volume?.[i]);
    bars.push({
      symbol: mappedSymbol,
      timestamp,
      open,
      high,
      low,
      close,
      volume: volumeValue === null ? undefined : volumeValue
    });
  }

  return bars.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const backoff = (attempt: number, minMs: number, maxMs: number): number =>
  Math.min(maxMs, minMs * 2 ** Math.max(0, attempt - 1));

const floorToIntervalStart = (tsMs: number, intervalMinutes: number): number => {
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;
  return Math.floor(tsMs / intervalMs) * intervalMs;
};

const chunk = <T>(items: T[], size: number): T[][] => {
  if (size <= 0 || items.length === 0) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

export class YahooLiveBridge {
  private running = false;
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | undefined;
  private lastPollAt: string | undefined;
  private lastIngestAt: string | undefined;
  private polls = 0;
  private ingestCalls = 0;
  private ingestedBars = 0;
  private reconnectAttempts = 0;
  private lastEmittedBySymbol = new Map<string, string>();
  private readonly intervalMinutes: number;

  constructor(private readonly cfg: YahooLiveBridgeConfig) {
    this.intervalMinutes = parseIntervalMinutes(cfg.interval);
  }

  private log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`${this.cfg.logPrefix} ${message}`);
  }

  status(): YahooLiveBridgeStatus {
    return {
      enabled: this.cfg.enabled,
      running: this.running,
      lastError: this.lastError,
      lastPollAt: this.lastPollAt,
      lastIngestAt: this.lastIngestAt,
      polls: this.polls,
      ingestCalls: this.ingestCalls,
      ingestedBars: this.ingestedBars,
      reconnectAttempts: this.reconnectAttempts,
      trackedSymbols: this.cfg.symbols.map((sourceSymbol) => ({
        sourceSymbol,
        lastEmittedTimestamp: this.lastEmittedBySymbol.get(sourceSymbol)
      }))
    };
  }

  private yahooUrl(sourceSymbol: string): string {
    const params = new URLSearchParams({
      interval: this.cfg.interval,
      range: this.cfg.range,
      events: 'history'
    });
    return `${this.cfg.yahooBaseUrl}/v8/finance/chart/${encodeURIComponent(
      sourceSymbol
    )}?${params.toString()}`;
  }

  private async fetchSymbolBars(sourceSymbol: string): Promise<YahooOneMinuteBar[]> {
    const parsed = (await getYahooJson(this.yahooUrl(sourceSymbol), {
      userAgent: this.cfg.userAgent,
      retries: this.cfg.requestRetries,
      forceCurl: this.cfg.forceCurl
    })) as YahooChartResponse;

    if (parsed.chart?.error) {
      const code = parsed.chart.error.code ?? 'unknown';
      const description = parsed.chart.error.description ?? 'unknown error';
      throw new Error(`Yahoo ${sourceSymbol} error (${code}): ${description}`);
    }

    const rows = parseYahooChartResponse(parsed, sourceSymbol, this.cfg.symbolMap);
    if (rows.length === 0) {
      return [];
    }

    const nowMs = Date.now();
    const closedCutoffMs =
      floorToIntervalStart(nowMs, this.intervalMinutes) - this.intervalMinutes * 60_000;
    const lastEmitted = this.lastEmittedBySymbol.get(sourceSymbol);
    const previousLastEmitted = lastEmitted
      ? Date.parse(lastEmitted) - this.cfg.overlapSeconds * 1000
      : Number.NEGATIVE_INFINITY;

    return rows.filter((bar) => {
      const tsMs = Date.parse(bar.timestamp);
      return tsMs > previousLastEmitted && tsMs <= closedCutoffMs;
    });
  }

  private async pushBarsToTrainingApi(bars: YahooOneMinuteBar[]): Promise<void> {
    if (bars.length === 0) {
      return;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    if (this.cfg.trainingApiKey) {
      headers[this.cfg.trainingApiKeyHeader] = this.cfg.trainingApiKey;
    }

    for (const batch of chunk(bars, this.cfg.maxBarsPerIngest)) {
      const response = await fetch(`${this.cfg.trainingApiBaseUrl}/training/ingest-bars`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ bars: batch })
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Training ingest HTTP ${response.status}: ${body.slice(0, 400)}`);
      }
      this.ingestCalls += 1;
      this.ingestedBars += batch.length;
    }
    this.lastIngestAt = new Date().toISOString();
  }

  private async pollOnce(): Promise<void> {
    const perSymbolBars = await Promise.all(
      this.cfg.symbols.map(async (sourceSymbol) => ({
        sourceSymbol,
        bars: await this.fetchSymbolBars(sourceSymbol)
      }))
    );

    const outgoing: YahooOneMinuteBar[] = [];
    for (const { sourceSymbol, bars } of perSymbolBars) {
      if (bars.length > 0) {
        this.lastEmittedBySymbol.set(sourceSymbol, bars[bars.length - 1].timestamp);
        outgoing.push(...bars);
      }
    }

    if (outgoing.length > 0) {
      await this.pushBarsToTrainingApi(outgoing);
      this.log(`Forwarded ${outgoing.length} bars to training API.`);
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.running) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timer = setTimeout(() => {
      void this.loop();
    }, delayMs);
  }

  private async loop(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      await this.pollOnce();
      this.polls += 1;
      this.lastPollAt = new Date().toISOString();
      this.lastError = undefined;
      this.reconnectAttempts = 0;
      this.scheduleNext(this.cfg.pollIntervalMs);
    } catch (error) {
      this.lastError = (error as Error).message;
      this.reconnectAttempts += 1;
      const waitMs = backoff(
        this.reconnectAttempts,
        this.cfg.reconnectMinMs,
        this.cfg.reconnectMaxMs
      );
      this.log(`Polling error: ${this.lastError}. Retrying in ${waitMs}ms.`);
      await sleep(waitMs);
      this.scheduleNext(0);
    }
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled) {
      this.log('Bridge disabled (set YAHOO_BRIDGE_ENABLED=true to run).');
      return;
    }
    if (this.running) {
      return;
    }
    if (this.cfg.symbols.length === 0) {
      throw new Error('No Yahoo symbols configured');
    }

    this.running = true;
    this.log(
      `Starting Yahoo bridge for symbols=${this.cfg.symbols.join(',')} interval=${this.cfg.interval} range=${this.cfg.range}`
    );
    this.scheduleNext(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const parseYahooSymbolsEnv = (raw: string | undefined): string[] => {
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const parseYahooSymbolMapEnv = (
  raw: string | undefined
): Partial<Record<string, SymbolCode>> => {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  const out: Partial<Record<string, SymbolCode>> = {};
  for (const [source, target] of Object.entries(parsed)) {
    const mapped = mapYahooSymbol(target);
    if (!mapped) {
      continue;
    }
    out[source.trim().toUpperCase()] = mapped;
  }
  return out;
};
