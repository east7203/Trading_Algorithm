import { setTimeout as sleep } from 'node:timers/promises';
import type { SymbolCode } from '../../domain/types.js';

export interface DatabentoOneMinuteBar {
  symbol: SymbolCode;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface DatabentoLiveBridgeConfig {
  enabled: boolean;
  apiKey: string;
  dataset: string;
  schema: string;
  stypeIn: string;
  symbols: string[];
  symbolMap: Partial<Record<string, SymbolCode>>;
  pollIntervalMs: number;
  initialLookbackMinutes: number;
  overlapSeconds: number;
  maxBarsPerIngest: number;
  databentoBaseUrl: string;
  trainingApiBaseUrl: string;
  trainingApiKey?: string;
  trainingApiKeyHeader: string;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  logPrefix: string;
}

export interface DatabentoLiveBridgeStatus {
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

const parseCsvLine = (line: string): string[] => line.split(',').map((part) => part.trim());

const toFiniteNumber = (raw: string): number | null => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeIso = (raw: string): string | null => {
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

const tokenizeSymbol = (raw: string): string[] =>
  raw
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const inferSymbol = (raw: string): SymbolCode | null => {
  const tokens = tokenizeSymbol(raw);
  const candidates = tokens.length > 0 ? tokens : [raw.toUpperCase()];
  const priority = ['MNQ', 'MYM', 'NAS100', 'US30', 'USTEC', 'US100', 'ES', 'MES', 'SPY', 'SPX', 'GSPC', 'US500', 'DJ30', 'DJI', 'NQ', 'YM'];

  for (const token of candidates) {
    for (const key of priority) {
      if (token === key || token.startsWith(key)) {
        return defaultSymbolAliases[key];
      }
    }
  }
  return null;
};

export const mapDatabentoSymbol = (
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

export const parseDatabentoOhlcvCsv = (
  csv: string,
  requestedSymbol: string,
  symbolMap: Partial<Record<string, SymbolCode>> = {}
): DatabentoOneMinuteBar[] => {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (names: string[]): number => headers.findIndex((h) => names.includes(h));
  const tsIdx = idx(['ts_event', 'timestamp', 'time', 'datetime']);
  const openIdx = idx(['open', 'o']);
  const highIdx = idx(['high', 'h']);
  const lowIdx = idx(['low', 'l']);
  const closeIdx = idx(['close', 'c']);
  const volumeIdx = idx(['volume', 'v']);
  const symbolIdx = idx(['symbol', 'raw_symbol', 'stype_out_symbol']);

  if (tsIdx < 0 || openIdx < 0 || highIdx < 0 || lowIdx < 0 || closeIdx < 0) {
    return [];
  }

  const fallbackSymbol = mapDatabentoSymbol(requestedSymbol, symbolMap);
  const out: DatabentoOneMinuteBar[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < headers.length) {
      continue;
    }

    const ts = normalizeIso(cols[tsIdx]);
    if (!ts) {
      continue;
    }
    const open = toFiniteNumber(cols[openIdx]);
    const high = toFiniteNumber(cols[highIdx]);
    const low = toFiniteNumber(cols[lowIdx]);
    const close = toFiniteNumber(cols[closeIdx]);
    if (open === null || high === null || low === null || close === null) {
      continue;
    }
    const mapped =
      symbolIdx >= 0 ? mapDatabentoSymbol(cols[symbolIdx], symbolMap) : fallbackSymbol;
    if (!mapped) {
      continue;
    }

    const volume =
      volumeIdx >= 0 && cols[volumeIdx] !== ''
        ? toFiniteNumber(cols[volumeIdx]) ?? undefined
        : undefined;

    out.push({
      symbol: mapped,
      timestamp: ts,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const backoff = (attempt: number, minMs: number, maxMs: number): number =>
  Math.min(maxMs, minMs * 2 ** Math.max(0, attempt - 1));

const floorToMinuteStart = (tsMs: number): number => Math.floor(tsMs / 60_000) * 60_000;

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

export class DatabentoLiveBridge {
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

  constructor(private readonly cfg: DatabentoLiveBridgeConfig) {}

  private log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`${this.cfg.logPrefix} ${message}`);
  }

  status(): DatabentoLiveBridgeStatus {
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

  private databentoUrl(sourceSymbol: string, startIso: string): string {
    const q = new URLSearchParams({
      dataset: this.cfg.dataset,
      schema: this.cfg.schema,
      stype_in: this.cfg.stypeIn,
      symbols: sourceSymbol,
      start: startIso,
      encoding: 'csv',
      compression: 'none'
    });
    return `${this.cfg.databentoBaseUrl}/timeseries.get_range?${q.toString()}`;
  }

  private async fetchSymbolBars(sourceSymbol: string): Promise<DatabentoOneMinuteBar[]> {
    const nowMs = Date.now();
    const lastEmitted = this.lastEmittedBySymbol.get(sourceSymbol);
    const startMs = lastEmitted
      ? Date.parse(lastEmitted) - this.cfg.overlapSeconds * 1000
      : nowMs - this.cfg.initialLookbackMinutes * 60_000;
    const startIso = new Date(Math.max(0, startMs)).toISOString();

    const response = await fetch(this.databentoUrl(sourceSymbol, startIso), {
      method: 'GET',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.cfg.apiKey}:`).toString('base64')}`,
        Accept: 'text/csv'
      }
    });
    const csv = await response.text();
    if (!response.ok) {
      throw new Error(`Databento ${sourceSymbol} HTTP ${response.status}: ${csv.slice(0, 400)}`);
    }

    const rows = parseDatabentoOhlcvCsv(csv, sourceSymbol, this.cfg.symbolMap);
    if (rows.length === 0) {
      return [];
    }

    const closedCutoffMs = floorToMinuteStart(nowMs) - 60_000;
    const previousLastEmitted = lastEmitted ? Date.parse(lastEmitted) : Number.NEGATIVE_INFINITY;
    return rows.filter((bar) => {
      const tsMs = Date.parse(bar.timestamp);
      return tsMs > previousLastEmitted && tsMs <= closedCutoffMs;
    });
  }

  private async pushBarsToTrainingApi(bars: DatabentoOneMinuteBar[]): Promise<void> {
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

    const outgoing: DatabentoOneMinuteBar[] = [];
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
      this.log('Bridge disabled (set DATABENTO_BRIDGE_ENABLED=true to run).');
      return;
    }
    if (this.running) {
      return;
    }
    if (this.cfg.symbols.length === 0) {
      throw new Error('No Databento symbols configured');
    }
    if (this.cfg.apiKey.trim().length === 0) {
      throw new Error('DATABENTO_API_KEY is required');
    }

    this.running = true;
    this.log(
      `Starting Databento bridge for symbols=${this.cfg.symbols.join(',')} dataset=${this.cfg.dataset} schema=${this.cfg.schema}`
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

export const parseDatabentoSymbolsEnv = (raw: string | undefined): string[] => {
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const parseDatabentoSymbolMapEnv = (
  raw: string | undefined
): Partial<Record<string, SymbolCode>> => {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  const out: Partial<Record<string, SymbolCode>> = {};
  for (const [source, target] of Object.entries(parsed)) {
    const mapped = mapDatabentoSymbol(target);
    if (!mapped) {
      continue;
    }
    out[source.trim().toUpperCase()] = mapped;
  }
  return out;
};
