import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import type { SymbolCode } from '../domain/types.js';

interface CliArgs {
  tickers: string[];
  start: string;
  end: string;
  multiplier: number;
  timespan: string;
  adjusted: boolean;
  sort: 'asc' | 'desc';
  limit: number;
  outputDir: string;
  baseUrl: string;
  requestDelayMs: number;
  retries: number;
  symbolMap: Partial<Record<string, SymbolCode>>;
  apiKey?: string;
}

interface PolygonAggResult {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

interface PolygonAggResponse {
  status?: string;
  request_id?: string;
  next_url?: string;
  results?: PolygonAggResult[];
  error?: string;
  message?: string;
}

interface OutputBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  symbol: SymbolCode;
}

const usage = (): string =>
  [
    'Usage:',
    '  POLYGON_API_KEY=... npm run fetch:polygon -- --tickers QQQ,SPY --start 2020-01-01 --end 2026-03-10 --timespan day',
    '',
    'Options:',
    '  --tickers QQQ,SPY                         (required)',
    '  --start 2020-01-01                        (default: 2000-01-01)',
    '  --end 2026-03-10                          (default: now)',
    '  --multiplier 1                            (default: 1)',
    '  --timespan minute|hour|day|week|month     (default: day)',
    '  --adjusted true|false                     (default: true)',
    '  --sort asc|desc                           (default: asc)',
    '  --limit 50000                             (default: 50000)',
    '  --outputDir data/historical/polygon       (default: data/historical/polygon)',
    '  --symbolMap {"QQQ":"NQ","SPY":"ES"}',
    '  --requestDelayMs 250                      (default: 250)',
    '  --retries 5                               (default: 5)',
    '  --baseUrl https://api.polygon.io',
    '  --apiKey YOUR_KEY                         (optional, else POLYGON_API_KEY)',
    '',
    'Environment:',
    '  POLYGON_API_KEY=...                       (required if --apiKey not set)',
    '  POLYGON_ENV_FILE=.env.polygon             (optional env loader)'
  ].join('\n');

const knownSymbols = new Set<SymbolCode>(['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM']);

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const toPositiveInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const valueFor = (argv: string[], index: number, token: string): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${token}`);
  }
  return value;
};

const nowIso = (): string => new Date().toISOString();

const sanitize = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_');

const parseDateOrThrow = (value: string, name: string): string => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return new Date(parsed).toISOString();
};

const loadEnvFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

const parseSymbolMap = (raw: string | undefined): Partial<Record<string, SymbolCode>> => {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  const out: Partial<Record<string, SymbolCode>> = {};
  for (const [source, target] of Object.entries(parsed)) {
    const symbol = target.trim().toUpperCase() as SymbolCode;
    if (!knownSymbols.has(symbol)) {
      continue;
    }
    out[source.trim().toUpperCase()] = symbol;
  }
  return out;
};

const defaultAliases: Record<string, SymbolCode> = {
  QQQ: 'NQ',
  'I:NDX': 'NQ',
  '^NDX': 'NQ',
  NDX: 'NQ',
  NAS100: 'NQ',
  US100: 'NQ',
  USTEC: 'NQ',
  SPY: 'ES',
  'I:SPX': 'ES',
  '^GSPC': 'ES',
  GSPC: 'ES',
  SPX: 'ES',
  US500: 'ES',
  'ES=F': 'ES',
  DIA: 'YM',
  'I:DJI': 'YM',
  '^DJI': 'YM',
  DJI: 'YM',
  DJ30: 'YM',
  US30: 'YM',
  MNQ: 'MNQ',
  MYM: 'MYM',
  'MNQ=F': 'MNQ',
  'MYM=F': 'MYM',
  'NQ=F': 'NQ',
  'YM=F': 'YM'
};

export const mapPolygonTicker = (
  sourceTicker: string,
  customMap: Partial<Record<string, SymbolCode>> = {}
): SymbolCode | null => {
  const normalized = sourceTicker.trim().toUpperCase();
  if (normalized.length === 0) {
    return null;
  }
  if (customMap[normalized]) {
    return customMap[normalized] ?? null;
  }
  if (defaultAliases[normalized]) {
    return defaultAliases[normalized];
  }
  const tokens = normalized.split(/[^A-Z0-9:=^]+/).filter((part) => part.length > 0);
  for (const token of tokens) {
    if (defaultAliases[token]) {
      return defaultAliases[token];
    }
  }
  return null;
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    tickers: [],
    start: '2000-01-01T00:00:00.000Z',
    end: nowIso(),
    multiplier: 1,
    timespan: 'day',
    adjusted: true,
    sort: 'asc',
    limit: 50_000,
    outputDir: path.resolve(process.cwd(), 'data', 'historical', 'polygon'),
    baseUrl: 'https://api.polygon.io',
    requestDelayMs: 250,
    retries: 5,
    symbolMap: {}
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      throw new Error(usage());
    }
    if (!token.startsWith('--')) {
      continue;
    }
    const value = valueFor(argv, i, token);
    switch (token) {
      case '--tickers':
        out.tickers = value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        i += 1;
        break;
      case '--start':
        out.start = parseDateOrThrow(value, '--start');
        i += 1;
        break;
      case '--end':
        out.end = parseDateOrThrow(value, '--end');
        i += 1;
        break;
      case '--multiplier':
        out.multiplier = toPositiveInt(value, out.multiplier);
        i += 1;
        break;
      case '--timespan':
        out.timespan = value.trim().toLowerCase();
        i += 1;
        break;
      case '--adjusted':
        out.adjusted = parseBoolean(value, true);
        i += 1;
        break;
      case '--sort':
        out.sort = value.trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
        i += 1;
        break;
      case '--limit':
        out.limit = toPositiveInt(value, out.limit);
        i += 1;
        break;
      case '--outputDir':
        out.outputDir = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case '--baseUrl':
        out.baseUrl = value.trim().replace(/\/+$/, '');
        i += 1;
        break;
      case '--requestDelayMs':
        out.requestDelayMs = toPositiveInt(value, out.requestDelayMs);
        i += 1;
        break;
      case '--retries':
        out.retries = toPositiveInt(value, out.retries);
        i += 1;
        break;
      case '--symbolMap':
        out.symbolMap = parseSymbolMap(value);
        i += 1;
        break;
      case '--apiKey':
        out.apiKey = value.trim();
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (out.tickers.length === 0) {
    throw new Error('Provide at least one ticker via --tickers');
  }
  if (Date.parse(out.end) <= Date.parse(out.start)) {
    throw new Error('--end must be greater than --start');
  }

  const allowedTimespans = new Set(['minute', 'hour', 'day', 'week', 'month', 'quarter', 'year']);
  if (!allowedTimespans.has(out.timespan)) {
    throw new Error(`Unsupported --timespan "${out.timespan}"`);
  }

  return out;
};

const initialAggUrl = (args: CliArgs, ticker: string, apiKey: string): string => {
  const fromMs = Date.parse(args.start);
  const toMs = Date.parse(args.end);
  const query = new URLSearchParams({
    adjusted: String(args.adjusted),
    sort: args.sort,
    limit: String(args.limit),
    apiKey
  });
  return `${args.baseUrl}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${
    args.multiplier
  }/${encodeURIComponent(args.timespan)}/${fromMs}/${toMs}?${query.toString()}`;
};

const withApiKey = (url: string, apiKey: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}apiKey=${encodeURIComponent(apiKey)}`;

const outputFilePath = (args: CliArgs, ticker: string): string => {
  const tickerTag = sanitize(ticker);
  const fromTag = sanitize(args.start).replace(/[:]/g, '-');
  const toTag = sanitize(args.end).replace(/[:]/g, '-');
  return path.join(
    args.outputDir,
    `polygon_${tickerTag}_${args.multiplier}${args.timespan}_${fromTag}_${toTag}.csv`
  );
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseAggRows = (
  payload: PolygonAggResponse,
  sourceTicker: string,
  symbolMap: Partial<Record<string, SymbolCode>>
): OutputBar[] => {
  const mapped = mapPolygonTicker(sourceTicker, symbolMap);
  if (!mapped) {
    throw new Error(
      `Could not map ticker "${sourceTicker}" to internal symbol. Provide --symbolMap.`
    );
  }

  const rows = Array.isArray(payload.results) ? payload.results : [];
  const out: OutputBar[] = [];
  for (const row of rows) {
    const t = toFiniteNumber(row.t);
    const open = toFiniteNumber(row.o);
    const high = toFiniteNumber(row.h);
    const low = toFiniteNumber(row.l);
    const close = toFiniteNumber(row.c);
    if (t === null || open === null || high === null || low === null || close === null) {
      continue;
    }
    const volumeRaw = toFiniteNumber(row.v);
    out.push({
      timestamp: new Date(t).toISOString(),
      open,
      high,
      low,
      close,
      volume: volumeRaw === null ? undefined : volumeRaw,
      symbol: mapped
    });
  }

  return out;
};

const dedupeAndSort = (bars: OutputBar[]): OutputBar[] => {
  const byKey = new Map<string, OutputBar>();
  for (const bar of bars) {
    byKey.set(`${bar.symbol}|${bar.timestamp}`, bar);
  }
  return [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const toCsv = (bars: OutputBar[]): string => {
  const header = 'timestamp,open,high,low,close,volume,symbol';
  const lines = bars.map((bar) =>
    [
      bar.timestamp,
      bar.open.toString(),
      bar.high.toString(),
      bar.low.toString(),
      bar.close.toString(),
      bar.volume === undefined ? '' : bar.volume.toString(),
      bar.symbol
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
};

const getJsonWithRetry = async (
  url: string,
  retries: number
): Promise<{ status: number; payload: PolygonAggResponse }> => {
  let lastError = 'Unknown Polygon error';
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    });
    const text = await response.text();
    let payload: PolygonAggResponse = {};
    try {
      payload = JSON.parse(text) as PolygonAggResponse;
    } catch {
      payload = {
        status: 'ERROR',
        message: `Non-JSON response: ${text.slice(0, 500)}`
      };
    }

    if (response.ok) {
      return {
        status: response.status,
        payload
      };
    }

    lastError = payload.error || payload.message || `HTTP ${response.status}`;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Polygon request failed: ${lastError}`);
    }

    const waitMs = Math.min(10_000, 400 * 2 ** (attempt - 1));
    await sleep(waitMs);
  }
  throw new Error(`Polygon request failed: ${lastError}`);
};

const fetchTickerAggs = async (
  args: CliArgs,
  ticker: string,
  apiKey: string
): Promise<OutputBar[]> => {
  let nextUrl: string | null = initialAggUrl(args, ticker, apiKey);
  const rows: OutputBar[] = [];
  let pages = 0;

  while (nextUrl) {
    const { payload } = await getJsonWithRetry(nextUrl, args.retries);
    pages += 1;
    const pageRows = parseAggRows(payload, ticker, args.symbolMap);
    for (const row of pageRows) {
      rows.push(row);
    }
    nextUrl = payload.next_url ? withApiKey(payload.next_url, apiKey) : null;
    if (nextUrl && args.requestDelayMs > 0) {
      await sleep(args.requestDelayMs);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`Fetched ${ticker}: ${rows.length} bars across ${pages} page(s)`);
  return dedupeAndSort(rows);
};

export const runFetchPolygonHistorical = async (): Promise<void> => {
  try {
    const envFile = process.env.POLYGON_ENV_FILE
      ? path.resolve(process.cwd(), process.env.POLYGON_ENV_FILE)
      : path.resolve(process.cwd(), '.env.polygon');
    loadEnvFile(envFile);

    const args = parseArgs(process.argv.slice(2));
    const apiKey = (args.apiKey ?? process.env.POLYGON_API_KEY ?? '').trim();
    if (!apiKey || apiKey.includes('your_') || apiKey.includes('replace_me')) {
      throw new Error('Missing valid Polygon API key (set POLYGON_API_KEY or --apiKey)');
    }

    await fsPromises.mkdir(args.outputDir, { recursive: true });
    const files: string[] = [];

    for (const ticker of args.tickers) {
      const bars = await fetchTickerAggs(args, ticker, apiKey);
      if (bars.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`No bars returned for ${ticker}`);
        continue;
      }
      const outputPath = outputFilePath(args, ticker);
      await fsPromises.writeFile(outputPath, toCsv(bars), 'utf8');
      files.push(outputPath);
      // eslint-disable-next-line no-console
      console.log(`Saved ${ticker}: ${outputPath}`);
    }

    // eslint-disable-next-line no-console
    console.log(`Done. Wrote ${files.length} file(s).`);
    if (files.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `Next: npm run train:model -- ${files.map((file) => `--input ${file}`).join(' ')}`
      );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
};

const isDirectRun = (): boolean => {
  const argv1 = process.argv[1];
  if (!argv1) {
    return false;
  }
  return import.meta.url === pathToFileURL(argv1).href;
};

if (isDirectRun()) {
  void runFetchPolygonHistorical();
}
