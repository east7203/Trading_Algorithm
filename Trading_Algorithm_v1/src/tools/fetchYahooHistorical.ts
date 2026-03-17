import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import type { SymbolCode } from '../domain/types.js';
import {
  parseYahooChartResponse,
  parseYahooSymbolMapEnv,
  parseYahooSymbolsEnv
} from '../integrations/yahoo/yahooLiveBridge.js';
import { getYahooJson } from '../integrations/yahoo/yahooHttpClient.js';

interface CliArgs {
  symbols: string[];
  interval: string;
  range?: string;
  startSec?: number;
  endSec?: number;
  chunkDays: number;
  outputDir: string;
  symbolMap: Partial<Record<string, SymbolCode>>;
  yahooBaseUrl: string;
  userAgent: string;
  requestDelayMs: number;
  requestRetries: number;
  forceCurl: boolean;
}

const ONE_DAY_SECONDS = 24 * 60 * 60;

const usage = (): string =>
  [
    'Usage:',
    '  npm run fetch:yahoo -- --symbols ^NDX,^DJI [--interval 1m] [--start 2026-02-01T00:00:00Z --end 2026-03-01T00:00:00Z]',
    '',
    'Options:',
    '  --symbols ^NDX,^DJI            (required)',
    '  --interval 1m                  (default: 1m)',
    '  --range 5d                     (optional; cannot be combined with --start/--end)',
    '  --start 2026-02-01T00:00:00Z   (optional)',
    '  --end 2026-03-01T00:00:00Z     (optional; defaults to now if --start is set)',
    '  --chunkDays 7                  (default: 7 for 1m, 59 otherwise)',
    '  --outputDir data/historical    (default: data/historical)',
    '  --symbolMap {"^NDX":"NAS100","^DJI":"US30"}',
    '  --requestDelayMs 350           (default: 350)',
    '  --requestRetries 5             (default: 5)',
    '  --forceCurl true|false         (default: false)',
    '  --baseUrl https://query2.finance.yahoo.com'
  ].join('\n');

const valueFor = (argv: string[], index: number, token: string): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${token}`);
  }
  return value;
};

const parseTimestamp = (value: string, name: string): number => {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid ${name} timestamp: ${value}`);
  }
  return Math.floor(parsed / 1000);
};

const defaultChunkDays = (interval: string): number =>
  interval.trim().toLowerCase() === '1m' ? 7 : 59;

const nowSec = (): number => Math.floor(Date.now() / 1000);

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    symbols: [],
    interval: '1m',
    chunkDays: 0,
    outputDir: path.resolve(process.cwd(), 'data', 'historical'),
    symbolMap: {},
    yahooBaseUrl: 'https://query2.finance.yahoo.com',
    userAgent: 'Mozilla/5.0',
    requestDelayMs: 350,
    requestRetries: 5,
    forceCurl: false
  };

  let startRaw: string | undefined;
  let endRaw: string | undefined;

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
      case '--symbols':
        out.symbols = parseYahooSymbolsEnv(value);
        i += 1;
        break;
      case '--interval':
        out.interval = value.trim();
        i += 1;
        break;
      case '--range':
        out.range = value.trim();
        i += 1;
        break;
      case '--start':
        startRaw = value.trim();
        i += 1;
        break;
      case '--end':
        endRaw = value.trim();
        i += 1;
        break;
      case '--chunkDays':
        out.chunkDays = Number.parseInt(value, 10);
        i += 1;
        break;
      case '--outputDir':
        out.outputDir = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case '--symbolMap':
        out.symbolMap = parseYahooSymbolMapEnv(value);
        i += 1;
        break;
      case '--requestDelayMs':
        out.requestDelayMs = Number.parseInt(value, 10);
        i += 1;
        break;
      case '--baseUrl':
        out.yahooBaseUrl = value.trim().replace(/\/+$/, '');
        i += 1;
        break;
      case '--userAgent':
        out.userAgent = value.trim();
        i += 1;
        break;
      case '--requestRetries':
        out.requestRetries = Number.parseInt(value, 10);
        i += 1;
        break;
      case '--forceCurl':
        out.forceCurl = parseBoolean(value, false);
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (out.symbols.length === 0) {
    throw new Error('Provide at least one symbol via --symbols');
  }
  if (out.chunkDays <= 0) {
    out.chunkDays = defaultChunkDays(out.interval);
  }
  if (!Number.isFinite(out.requestDelayMs) || out.requestDelayMs < 0) {
    out.requestDelayMs = 350;
  }
  if (!Number.isFinite(out.requestRetries) || out.requestRetries < 1) {
    out.requestRetries = 5;
  }

  if (out.range && (startRaw || endRaw)) {
    throw new Error('Use --range OR --start/--end, not both');
  }

  if (startRaw) {
    out.startSec = parseTimestamp(startRaw, '--start');
    out.endSec = endRaw ? parseTimestamp(endRaw, '--end') : nowSec();
    if (out.endSec <= out.startSec) {
      throw new Error('--end must be greater than --start');
    }
  } else if (endRaw) {
    throw new Error('--end requires --start');
  } else if (!out.range) {
    if (out.interval.toLowerCase() === '1m') {
      out.endSec = nowSec();
      out.startSec = out.endSec - 30 * ONE_DAY_SECONDS;
    } else {
      out.range = 'max';
    }
  }

  if (out.interval.toLowerCase() === '1m' && out.startSec !== undefined) {
    const minStart = nowSec() - 30 * ONE_DAY_SECONDS;
    if (out.startSec < minStart) {
      // eslint-disable-next-line no-console
      console.warn(
        `Clamping --start to last 30 days for 1m interval (${new Date(minStart * 1000).toISOString()})`
      );
      out.startSec = minStart;
      if (out.endSec && out.endSec <= out.startSec) {
        out.endSec = nowSec();
      }
    }
  }

  return out;
};

const sanitize = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_');

const buildRangeUrl = (args: CliArgs, symbol: string): string => {
  const query = new URLSearchParams({
    interval: args.interval,
    range: args.range ?? '1d',
    events: 'history'
  });
  return `${args.yahooBaseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?${query.toString()}`;
};

const buildPeriodUrl = (args: CliArgs, symbol: string, startSec: number, endSec: number): string => {
  const query = new URLSearchParams({
    interval: args.interval,
    period1: String(startSec),
    period2: String(endSec),
    events: 'history'
  });
  return `${args.yahooBaseUrl}/v8/finance/chart/${encodeURIComponent(symbol)}?${query.toString()}`;
};

const outputFilePath = (args: CliArgs, symbol: string, from: string, to: string): string => {
  const symbolTag = sanitize(symbol);
  const intervalTag = sanitize(args.interval);
  const fromTag = sanitize(from).replace(/[:]/g, '-');
  const toTag = sanitize(to).replace(/[:]/g, '-');
  return path.join(args.outputDir, `yahoo_${symbolTag}_${intervalTag}_${fromTag}_${toTag}.csv`);
};

const toCsv = (
  rows: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    symbol: SymbolCode;
  }>
): string => {
  const header = 'timestamp,open,high,low,close,volume,symbol';
  const lines = rows.map((row) =>
    [
      row.timestamp,
      row.open.toString(),
      row.high.toString(),
      row.low.toString(),
      row.close.toString(),
      row.volume === undefined ? '' : row.volume.toString(),
      row.symbol
    ].join(',')
  );
  return `${header}\n${lines.join('\n')}\n`;
};

const fetchJson = async (url: string, args: CliArgs): Promise<unknown> => {
  return getYahooJson(url, {
    userAgent: args.userAgent,
    retries: args.requestRetries,
    forceCurl: args.forceCurl
  });
};

const dedupeBars = (
  bars: Array<{
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
    symbol: SymbolCode;
  }>
): Array<{
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  symbol: SymbolCode;
}> => {
  const byKey = new Map<string, (typeof bars)[number]>();
  for (const bar of bars) {
    byKey.set(`${bar.symbol}|${bar.timestamp}`, bar);
  }
  return [...byKey.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const run = async (): Promise<void> => {
  try {
    const args = parseArgs(process.argv.slice(2));
    await fs.mkdir(args.outputDir, { recursive: true });
    const files: string[] = [];

    for (const sourceSymbol of args.symbols) {
      const rows: ReturnType<typeof dedupeBars> = [];

      if (args.startSec !== undefined && args.endSec !== undefined) {
        const chunkSeconds = Math.max(1, args.chunkDays) * ONE_DAY_SECONDS;
        for (let from = args.startSec; from < args.endSec; from += chunkSeconds) {
          const to = Math.min(args.endSec, from + chunkSeconds);
          const payload = await fetchJson(buildPeriodUrl(args, sourceSymbol, from, to), args);
          const parsedRows = parseYahooChartResponse(payload, sourceSymbol, args.symbolMap);
          for (const row of parsedRows) {
            rows.push(row);
          }
          if (args.requestDelayMs > 0) {
            await sleep(args.requestDelayMs);
          }
        }
      } else {
        const payload = await fetchJson(buildRangeUrl(args, sourceSymbol), args);
        const parsedRows = parseYahooChartResponse(payload, sourceSymbol, args.symbolMap);
        for (const row of parsedRows) {
          rows.push(row);
        }
      }

      const deduped = dedupeBars(rows);
      if (deduped.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`No rows returned for ${sourceSymbol}`);
        continue;
      }

      const from = deduped[0].timestamp;
      const to = deduped[deduped.length - 1].timestamp;
      const filePath = outputFilePath(args, sourceSymbol, from, to);
      await fs.writeFile(filePath, toCsv(deduped), 'utf8');
      files.push(filePath);
      // eslint-disable-next-line no-console
      console.log(`Saved ${sourceSymbol}: ${filePath} (${deduped.length} rows)`);
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

void run();
