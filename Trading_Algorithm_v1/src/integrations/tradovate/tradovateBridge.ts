import { setTimeout as sleep } from 'node:timers/promises';
import { WebSocket } from 'ws';
import type { SymbolCode } from '../../domain/types.js';

interface TradovateAuthResponse {
  errorText?: string | null;
  accessToken?: string | null;
  mdAccessToken?: string | null;
  expirationTime?: string | null;
  userId?: number | null;
}

interface TradovateChartBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  upVolume?: number;
  downVolume?: number;
}

interface TradovateChartPacket {
  id: number;
  td?: number;
  eoh?: boolean;
  bars?: TradovateChartBar[];
}

interface TradovateWsEvent {
  i?: number;
  s?: number;
  e?: string;
  d?: Record<string, unknown>;
}

export interface BridgeOneMinuteBar {
  symbol: SymbolCode;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface TradovateBridgeConfig {
  enabled: boolean;
  tradovateApiUrl: string;
  tradovateMdWsUrl: string;
  username: string;
  password: string;
  appId?: string;
  appVersion?: string;
  cid?: number;
  sec?: string;
  symbols: string[];
  symbolMap: Partial<Record<string, SymbolCode>>;
  chartHistoryBars: number;
  trainingApiBaseUrl: string;
  trainingApiKey?: string;
  trainingApiKeyHeader: string;
  reconnectMinMs: number;
  reconnectMaxMs: number;
  logPrefix: string;
}

export interface TradovateBridgeStatus {
  enabled: boolean;
  running: boolean;
  connected: boolean;
  authenticated: boolean;
  subscribedSymbols: string[];
  lastError?: string;
  lastIngestAt?: string;
  ingestCalls: number;
  ingestedBars: number;
  reconnectAttempts: number;
  pendingRequests: number;
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeBarTimestamp = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
};

const resolveSymbolFromToken = (raw: string): SymbolCode | null => {
  const upper = raw.toUpperCase();
  const tokenized = upper.split(/[^A-Z0-9]+/).filter((token) => token.length > 0);
  const candidates = tokenized.length > 0 ? tokenized : [upper];
  const priority = ['MNQ', 'MYM', 'NAS100', 'US30', 'USTEC', 'US100', 'ES', 'MES', 'SPY', 'SPX', 'GSPC', 'US500', 'DJ30', 'DJI', 'NQ', 'YM'];

  for (const token of candidates) {
    for (const key of priority) {
      if (token.startsWith(key) || token === key) {
        return defaultSymbolAliases[key];
      }
    }
  }
  return null;
};

export const mapTradovateSymbol = (
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

  const inferred = resolveSymbolFromToken(normalized);
  if (inferred) {
    return inferred;
  }

  return null;
};

export const parseSocketPayloads = (rawMessage: string): TradovateWsEvent[] => {
  if (rawMessage.length === 0) {
    return [];
  }

  if (rawMessage.startsWith('a[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage.slice(1));
    } catch {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (typeof entry === 'string') {
          try {
            const parsedEntry = JSON.parse(entry);
            return isPlainObject(parsedEntry) ? (parsedEntry as TradovateWsEvent) : null;
          } catch {
            return null;
          }
        }
        return isPlainObject(entry) ? (entry as TradovateWsEvent) : null;
      })
      .filter((entry): entry is TradovateWsEvent => entry !== null);
  }

  if (rawMessage.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return [];
    }
    return isPlainObject(parsed) ? [parsed as TradovateWsEvent] : [];
  }

  return [];
};

export const extractFinalizedOneMinuteBars = (
  sourceSymbol: string,
  packets: TradovateChartPacket[],
  openBarBySymbol: Map<string, TradovateChartBar>,
  symbolMap: Partial<Record<string, SymbolCode>> = {}
): BridgeOneMinuteBar[] => {
  const mappedSymbol = mapTradovateSymbol(sourceSymbol, symbolMap);
  if (!mappedSymbol) {
    return [];
  }

  const emitted: BridgeOneMinuteBar[] = [];
  for (const packet of packets) {
    const bars = Array.isArray(packet.bars) ? packet.bars : [];
    for (const bar of bars) {
      const ts = normalizeBarTimestamp(bar.timestamp);
      if (!ts) {
        continue;
      }
      if (
        !isFiniteNumber(bar.open) ||
        !isFiniteNumber(bar.high) ||
        !isFiniteNumber(bar.low) ||
        !isFiniteNumber(bar.close)
      ) {
        continue;
      }

      const normalized: TradovateChartBar = {
        timestamp: ts,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        upVolume: isFiniteNumber(bar.upVolume) ? bar.upVolume : undefined,
        downVolume: isFiniteNumber(bar.downVolume) ? bar.downVolume : undefined
      };

      const previous = openBarBySymbol.get(sourceSymbol);
      if (!previous) {
        openBarBySymbol.set(sourceSymbol, normalized);
        continue;
      }

      if (previous.timestamp === normalized.timestamp) {
        openBarBySymbol.set(sourceSymbol, normalized);
        continue;
      }

      if (normalized.timestamp > previous.timestamp) {
        const volume =
          (previous.upVolume ?? 0) + (previous.downVolume ?? 0) > 0
            ? (previous.upVolume ?? 0) + (previous.downVolume ?? 0)
            : undefined;

        emitted.push({
          symbol: mappedSymbol,
          timestamp: previous.timestamp,
          open: previous.open,
          high: previous.high,
          low: previous.low,
          close: previous.close,
          volume
        });
        openBarBySymbol.set(sourceSymbol, normalized);
      }
    }
  }

  return emitted;
};

const authRequestBody = (cfg: TradovateBridgeConfig): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    name: cfg.username,
    password: cfg.password
  };
  if (cfg.appId && cfg.appId.trim().length > 0) {
    body.appId = cfg.appId;
  }
  if (cfg.appVersion && cfg.appVersion.trim().length > 0) {
    body.appVersion = cfg.appVersion;
  }
  if (typeof cfg.cid === 'number' && Number.isFinite(cfg.cid)) {
    body.cid = cfg.cid;
  }
  if (cfg.sec && cfg.sec.trim().length > 0) {
    body.sec = cfg.sec;
  }
  return body;
};

const parseChartPackets = (eventData: Record<string, unknown>): TradovateChartPacket[] => {
  const charts = eventData.charts;
  if (!Array.isArray(charts)) {
    return [];
  }
  const packets: TradovateChartPacket[] = [];
  for (const item of charts) {
    if (!isPlainObject(item) || !isFiniteNumber(item.id)) {
      continue;
    }
    const barsRaw = Array.isArray(item.bars) ? item.bars : [];
    const bars: TradovateChartBar[] = [];
    for (const bar of barsRaw) {
      if (!isPlainObject(bar)) {
        continue;
      }
      bars.push({
        timestamp: typeof bar.timestamp === 'string' ? bar.timestamp : '',
        open: Number(bar.open),
        high: Number(bar.high),
        low: Number(bar.low),
        close: Number(bar.close),
        upVolume: bar.upVolume === undefined ? undefined : Number(bar.upVolume),
        downVolume: bar.downVolume === undefined ? undefined : Number(bar.downVolume)
      });
    }
    packets.push({
      id: item.id,
      td: isFiniteNumber(item.td) ? item.td : undefined,
      eoh: item.eoh === true,
      bars
    });
  }
  return packets;
};

const backoff = (attempt: number, minMs: number, maxMs: number): number =>
  Math.min(maxMs, minMs * 2 ** Math.max(0, attempt - 1));

export class TradovateBridge {
  private running = false;
  private connected = false;
  private authenticated = false;
  private authenticationSent = false;
  private ws: WebSocket | null = null;
  private requestId = 1;
  private reconnectAttempts = 0;
  private renewTimer: NodeJS.Timeout | null = null;
  private accessToken: string | null = null;
  private mdAccessToken: string | null = null;
  private lastError: string | undefined;
  private lastIngestAt: string | undefined;
  private ingestCalls = 0;
  private ingestedBars = 0;
  private pendingRequestToSymbol = new Map<number, string>();
  private subscriptionToSymbol = new Map<number, string>();
  private openBarBySourceSymbol = new Map<string, TradovateChartBar>();

  constructor(private readonly cfg: TradovateBridgeConfig) {}

  status(): TradovateBridgeStatus {
    return {
      enabled: this.cfg.enabled,
      running: this.running,
      connected: this.connected,
      authenticated: this.authenticated,
      subscribedSymbols: [...new Set(this.subscriptionToSymbol.values())],
      lastError: this.lastError,
      lastIngestAt: this.lastIngestAt,
      ingestCalls: this.ingestCalls,
      ingestedBars: this.ingestedBars,
      reconnectAttempts: this.reconnectAttempts,
      pendingRequests: this.pendingRequestToSymbol.size
    };
  }

  private log(message: string): void {
    // eslint-disable-next-line no-console
    console.log(`${this.cfg.logPrefix} ${message}`);
  }

  private async fetchToken(): Promise<TradovateAuthResponse> {
    const response = await fetch(`${this.cfg.tradovateApiUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(authRequestBody(this.cfg))
    });
    const parsed = (await response.json()) as TradovateAuthResponse;
    if (!response.ok || !parsed.accessToken || parsed.errorText) {
      throw new Error(parsed.errorText || `Auth failed with HTTP ${response.status}`);
    }
    return parsed;
  }

  private async renewToken(): Promise<void> {
    if (!this.accessToken) {
      return;
    }
    const response = await fetch(`${this.cfg.tradovateApiUrl}/auth/renewaccesstoken`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: 'application/json'
      }
    });
    const parsed = (await response.json()) as TradovateAuthResponse;
    if (!response.ok || !parsed.accessToken || parsed.errorText) {
      throw new Error(parsed.errorText || `Token renewal failed with HTTP ${response.status}`);
    }

    this.accessToken = parsed.accessToken;
    this.mdAccessToken = parsed.mdAccessToken ?? parsed.accessToken;
    this.scheduleRenewal(parsed.expirationTime ?? null);
    this.log('Access token renewed.');
  }

  private scheduleRenewal(expirationTime: string | null): void {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }

    const defaultDelayMs = 60 * 60 * 1000;
    let delayMs = defaultDelayMs;
    if (expirationTime) {
      const parsed = Date.parse(expirationTime);
      if (!Number.isNaN(parsed)) {
        const candidate = parsed - Date.now() - 15 * 60 * 1000;
        delayMs = Math.max(60 * 1000, candidate);
      }
    }

    this.renewTimer = setTimeout(() => {
      void this.renewToken().catch((error) => {
        this.lastError = (error as Error).message;
        this.log(`Token renewal failed: ${this.lastError}`);
      });
    }, delayMs);
  }

  private sendFrame(frame: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.ws.send(frame);
  }

  private sendEndpoint(endpoint: string, body?: Record<string, unknown>, requestId?: number): number {
    const reqId = requestId ?? this.requestId++;
    const payload = body ? JSON.stringify(body) : '';
    this.sendFrame(`${endpoint}\n${reqId}\n\n${payload}`);
    return reqId;
  }

  private authorizeSocket(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    if (this.authenticationSent) {
      return;
    }
    const token = this.mdAccessToken ?? this.accessToken;
    if (!token) {
      return;
    }
    this.sendFrame(`authorize\n0\n\n${token}`);
    this.authenticationSent = true;
  }

  private subscribeCharts(): void {
    this.pendingRequestToSymbol.clear();
    this.subscriptionToSymbol.clear();
    this.openBarBySourceSymbol.clear();

    for (const symbol of this.cfg.symbols) {
      const requestId = this.sendEndpoint('md/getChart', {
        symbol,
        chartDescription: {
          underlyingType: 'MinuteBar',
          elementSize: 1,
          elementSizeUnit: 'UnderlyingUnits',
          withHistogram: false
        },
        timeRange: {
          asMuchAsElements: this.cfg.chartHistoryBars
        }
      });
      this.pendingRequestToSymbol.set(requestId, symbol);
    }
  }

  private async pushBarsToTrainingApi(bars: BridgeOneMinuteBar[]): Promise<void> {
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

    const response = await fetch(`${this.cfg.trainingApiBaseUrl}/training/ingest-bars`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ bars })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Training ingest failed (${response.status}): ${body.slice(0, 500)}`);
    }

    this.ingestCalls += 1;
    this.ingestedBars += bars.length;
    this.lastIngestAt = new Date().toISOString();
  }

  private async handleChartEvent(eventData: Record<string, unknown>): Promise<void> {
    const packets = parseChartPackets(eventData);
    if (packets.length === 0) {
      return;
    }

    const grouped = new Map<string, TradovateChartPacket[]>();
    for (const packet of packets) {
      const sourceSymbol = this.subscriptionToSymbol.get(packet.id);
      if (!sourceSymbol) {
        continue;
      }
      const bucket = grouped.get(sourceSymbol);
      if (bucket) {
        bucket.push(packet);
      } else {
        grouped.set(sourceSymbol, [packet]);
      }
    }

    const outgoing: BridgeOneMinuteBar[] = [];
    for (const [sourceSymbol, symbolPackets] of grouped.entries()) {
      outgoing.push(
        ...extractFinalizedOneMinuteBars(
          sourceSymbol,
          symbolPackets,
          this.openBarBySourceSymbol,
          this.cfg.symbolMap
        )
      );
    }

    if (outgoing.length > 0) {
      await this.pushBarsToTrainingApi(outgoing);
      this.log(`Forwarded ${outgoing.length} finalized bars to training API.`);
    }
  }

  private async handleWsMessage(rawData: string): Promise<void> {
    if (rawData === 'o') {
      this.authorizeSocket();
      return;
    }
    if (rawData === 'h') {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('[]');
      }
      return;
    }
    if (rawData === 'c') {
      return;
    }

    const messages = parseSocketPayloads(rawData);
    for (const message of messages) {
      if (message.i === 0) {
        if (message.s === 200) {
          this.authenticated = true;
          this.log('WebSocket authorized.');
          this.subscribeCharts();
          continue;
        }
        this.authenticated = false;
        this.lastError = `Authorization rejected: ${JSON.stringify(message.d ?? {})}`;
        throw new Error(this.lastError);
      }

      if (typeof message.i === 'number' && this.pendingRequestToSymbol.has(message.i)) {
        const sourceSymbol = this.pendingRequestToSymbol.get(message.i)!;
        this.pendingRequestToSymbol.delete(message.i);

        const d = isPlainObject(message.d) ? message.d : {};
        const historicalId = isFiniteNumber(d.historicalId) ? d.historicalId : null;
        const realtimeId = isFiniteNumber(d.realtimeId) ? d.realtimeId : null;
        if (historicalId !== null) {
          this.subscriptionToSymbol.set(historicalId, sourceSymbol);
        }
        if (realtimeId !== null) {
          this.subscriptionToSymbol.set(realtimeId, sourceSymbol);
        }
        this.log(
          `Subscribed chart for ${sourceSymbol} (historicalId=${historicalId ?? 'n/a'}, realtimeId=${realtimeId ?? 'n/a'})`
        );
        continue;
      }

      if (message.e === 'chart' && isPlainObject(message.d)) {
        await this.handleChartEvent(message.d);
      }
    }
  }

  private async connectWebSocketWithRetry(): Promise<void> {
    while (this.running) {
      try {
        await this.connectWebSocketOnce();
        return;
      } catch (error) {
        this.lastError = (error as Error).message;
        this.connected = false;
        this.authenticated = false;
        this.authenticationSent = false;
        this.reconnectAttempts += 1;
        const delayMs = backoff(
          this.reconnectAttempts,
          this.cfg.reconnectMinMs,
          this.cfg.reconnectMaxMs
        );
        this.log(`WebSocket connection failed (${this.lastError}). Retrying in ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }
  }

  private connectWebSocketOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.cfg.tradovateMdWsUrl);
      this.ws = ws;

      let settled = false;

      ws.on('open', () => {
        this.connected = true;
        this.authenticationSent = false;
        this.authenticated = false;
        this.log('Market data WebSocket connected.');
      });

      ws.on('message', (data: Buffer | string) => {
        void this
          .handleWsMessage(data.toString())
          .catch((error) => {
            this.lastError = (error as Error).message;
            this.log(`Message handling error: ${this.lastError}`);
            ws.close();
          });
      });

      ws.on('error', (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
          return;
        }
        this.lastError = (error as Error).message;
        this.log(`WebSocket error: ${this.lastError}`);
      });

      ws.on('close', () => {
        this.connected = false;
        this.authenticated = false;
        this.authenticationSent = false;
        this.log('Market data WebSocket closed.');
        if (!settled) {
          settled = true;
          reject(new Error('WebSocket closed before ready'));
          return;
        }
        if (this.running) {
          void this.connectWebSocketWithRetry();
        }
      });

      // Resolve once socket has stayed up long enough to begin streaming.
      setTimeout(() => {
        if (!settled) {
          settled = true;
          this.reconnectAttempts = 0;
          resolve();
        }
      }, 2000);
    });
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled) {
      this.log('Bridge disabled (set TRADOVATE_BRIDGE_ENABLED=true to run).');
      return;
    }
    if (this.running) {
      return;
    }
    this.running = true;

    try {
      const token = await this.fetchToken();
      this.accessToken = token.accessToken ?? null;
      this.mdAccessToken = token.mdAccessToken ?? token.accessToken ?? null;
      this.scheduleRenewal(token.expirationTime ?? null);
      this.log(`Authenticated Tradovate user ${token.userId ?? 'unknown'}.`);
      await this.connectWebSocketWithRetry();
    } catch (error) {
      this.lastError = (error as Error).message;
      this.running = false;
      this.log(`Bridge start failed: ${this.lastError}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
    this.authenticationSent = false;
  }
}

export const parseSymbolMapEnv = (
  raw: string | undefined
): Partial<Record<string, SymbolCode>> => {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  const out: Partial<Record<string, SymbolCode>> = {};
  for (const [key, value] of Object.entries(parsed)) {
    const normalizedKey = key.trim().toUpperCase();
    const mapped = mapTradovateSymbol(value);
    if (!mapped) {
      continue;
    }
    out[normalizedKey] = mapped;
  }
  return out;
};

export const parseSymbolsEnv = (raw: string | undefined): string[] => {
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};
