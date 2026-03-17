import fs from 'node:fs/promises';
import path from 'node:path';
import type { SymbolCode } from '../domain/types.js';
import {
  mapYahooSymbol,
  parseYahooSymbolMapEnv,
  parseYahooSymbolsEnv
} from '../integrations/yahoo/yahooLiveBridge.js';

interface CliArgs {
  symbols: string[];
  interval: 'd' | 'w' | 'm';
  outputDir: string;
  symbolMap: Partial<Record<string, SymbolCode>>;
  stooqBaseUrl: string;
  userAgent: string;
}

interface ParsedRow {
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
    '  npm run fetch:stooq -- --symbols ^NDX,^DJI [--interval d]',
    '',
    'Options:',
    '  --symbols ^NDX,^DJI                (required)',
    '  --interval d|w|m                   (default: d)',
    '  --outputDir data/historical        (default: data/historical)',
    '  --symbolMap {"^NDX":"NAS100","^DJI":"US30"}',
    '  --baseUrl https://stooq.com'
  ].join('\n');

const valueFor = (argv: string[], index: number, token: string): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${token}`);
  }
  return value;
};

const parseInterval = (raw: string): 'd' | 'w' | 'm' => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'd' || normalized === 'w' || normalized === 'm') {
    return normalized;
  }
  throw new Error(`Invalid --interval "${raw}", expected d, w, or m`);
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    symbols: [],
    interval: 'd',
    outputDir: path.resolve(process.cwd(), 'data', 'historical'),
    symbolMap: {},
    stooqBaseUrl: 'https://stooq.com',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
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
      case '--symbols':
        out.symbols = parseYahooSymbolsEnv(value);
        i += 1;
        break;
      case '--interval':
        out.interval = parseInterval(value);
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
      case '--baseUrl':
        out.stooqBaseUrl = value.trim().replace(/\/+$/, '');
        i += 1;
        break;
      case '--userAgent':
        out.userAgent = value.trim();
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (out.symbols.length === 0) {
    throw new Error('Provide at least one symbol via --symbols');
  }

  return out;
};

const sanitize = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_');

const stooqUrl = (args: CliArgs, sourceSymbol: string): string =>
  `${args.stooqBaseUrl}/q/d/l/?s=${encodeURIComponent(sourceSymbol)}&i=${encodeURIComponent(
    args.interval
  )}`;

const mapSymbolOrThrow = (
  sourceSymbol: string,
  symbolMap: Partial<Record<string, SymbolCode>>
): SymbolCode => {
  const mapped = mapYahooSymbol(sourceSymbol, symbolMap);
  if (!mapped) {
    throw new Error(
      `Could not map source symbol "${sourceSymbol}". Provide --symbolMap {"${sourceSymbol}":"NQ"}`
    );
  }
  return mapped;
};

const parseDate = (raw: string, line: number): string => {
  const parsed = Date.parse(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid date "${raw}" on line ${line}`);
  }
  return new Date(parsed).toISOString();
};

const toNumber = (raw: string, field: string, line: number): number => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${field} value "${raw}" on line ${line}`);
  }
  return parsed;
};

const parseStooqCsv = (
  csv: string,
  sourceSymbol: string,
  symbolMap: Partial<Record<string, SymbolCode>>
): ParsedRow[] => {
  const mappedSymbol = mapSymbolOrThrow(sourceSymbol, symbolMap);
  const normalizedCsv = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('Warning:'));

  if (normalizedCsv.length < 2) {
    return [];
  }
  if (normalizedCsv[0].toLowerCase() === 'no data') {
    return [];
  }

  const headers = normalizedCsv[0].split(',').map((header) => header.trim().toLowerCase());
  const dateIdx = headers.indexOf('date');
  const openIdx = headers.indexOf('open');
  const highIdx = headers.indexOf('high');
  const lowIdx = headers.indexOf('low');
  const closeIdx = headers.indexOf('close');
  const volumeIdx = headers.indexOf('volume');
  if (dateIdx < 0 || openIdx < 0 || highIdx < 0 || lowIdx < 0 || closeIdx < 0) {
    throw new Error('Unexpected Stooq CSV columns');
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < normalizedCsv.length; i += 1) {
    const cols = normalizedCsv[i].split(',').map((part) => part.trim());
    if (cols.length < headers.length) {
      continue;
    }
    const line = i + 1;
    const timestamp = parseDate(cols[dateIdx], line);
    const open = toNumber(cols[openIdx], 'open', line);
    const high = toNumber(cols[highIdx], 'high', line);
    const low = toNumber(cols[lowIdx], 'low', line);
    const close = toNumber(cols[closeIdx], 'close', line);
    const volume =
      volumeIdx >= 0 && cols[volumeIdx] !== '' ? toNumber(cols[volumeIdx], 'volume', line) : undefined;

    rows.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume,
      symbol: mappedSymbol
    });
  }

  return rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
};

const toCsv = (rows: ParsedRow[]): string => {
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

const run = async (): Promise<void> => {
  try {
    const args = parseArgs(process.argv.slice(2));
    await fs.mkdir(args.outputDir, { recursive: true });
    const files: string[] = [];

    for (const sourceSymbol of args.symbols) {
      const response = await fetch(stooqUrl(args, sourceSymbol), {
        method: 'GET',
        headers: {
          Accept: 'text/csv',
          'User-Agent': args.userAgent
        }
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Stooq request failed for ${sourceSymbol} (HTTP ${response.status})`);
      }

      const rows = parseStooqCsv(body, sourceSymbol, args.symbolMap);
      if (rows.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`No data returned for ${sourceSymbol}`);
        continue;
      }

      const symbolTag = sanitize(sourceSymbol);
      const pathOut = path.join(args.outputDir, `stooq_${symbolTag}_${args.interval}.csv`);
      await fs.writeFile(pathOut, toCsv(rows), 'utf8');
      files.push(pathOut);
      // eslint-disable-next-line no-console
      console.log(`Saved ${sourceSymbol}: ${pathOut} (${rows.length} rows)`);
    }

    // eslint-disable-next-line no-console
    console.log(`Done. Wrote ${files.length} file(s).`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
};

void run();
