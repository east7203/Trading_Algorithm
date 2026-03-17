import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  parseIbkrContractSpecsEnv,
  parseIbkrSymbolMapEnv,
  parseIbkrSymbolsEnv,
  resolveIbkrContractSpec
} from '../integrations/ibkr/ibkrConfig.js';

interface CliArgs {
  symbols: string[];
  start: string;
  end: string;
  timeframe: string;
  outputDir: string;
  useRth: boolean;
  continuous: boolean;
  pacingSleepSeconds: number;
}

const usage = (): never => {
  throw new Error(
    [
      'Usage:',
      '  npm run fetch:ibkr -- --symbols NQ,YM --start 2026-01-01T00:00:00Z --end 2026-03-12T00:00:00Z [--timeframe 1m] [--outputDir data/historical/ibkr] [--continuous true] [--useRth false]',
      '',
      'Examples:',
      '  npm run fetch:ibkr -- --symbols NQ,YM --start 2026-02-01T00:00:00Z --end 2026-03-12T00:00:00Z --timeframe 1m',
      '  npm run fetch:ibkr -- --symbols NQ,YM --start 2025-01-01T00:00:00Z --end 2026-03-12T00:00:00Z --timeframe 5m --continuous true'
    ].join('\n')
  );
};

const parseBoolean = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
};

const parseFloatOr = (raw: string | undefined, fallback: number, min?: number): number => {
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min !== undefined && parsed < min) {
    return min;
  }
  return parsed;
};

const loadEnvFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
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

const mapTimeframeToBarSize = (raw: string): string => {
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1m' || normalized === '1min' || normalized === '1 minute') {
    return '1 min';
  }
  if (normalized === '5m' || normalized === '5min' || normalized === '5 minutes') {
    return '5 mins';
  }
  if (normalized === '15m' || normalized === '15min' || normalized === '15 minutes') {
    return '15 mins';
  }
  if (normalized === '1h' || normalized === '60m' || normalized === '1 hour') {
    return '1 hour';
  }
  if (normalized === 'd1' || normalized === '1d' || normalized === '1 day') {
    return '1 day';
  }
  if (normalized === 'w1' || normalized === '1w' || normalized === '1 week') {
    return '1 week';
  }
  throw new Error(`Unsupported IBKR timeframe: ${raw}`);
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    symbols: [],
    start: '',
    end: '',
    timeframe: '1m',
    outputDir: 'data/historical/ibkr',
    useRth: false,
    continuous: true,
    pacingSleepSeconds: 11
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case '--symbols':
        if (!next) usage();
        out.symbols = parseIbkrSymbolsEnv(next);
        i += 1;
        break;
      case '--start':
        if (!next) usage();
        out.start = next;
        i += 1;
        break;
      case '--end':
        if (!next) usage();
        out.end = next;
        i += 1;
        break;
      case '--timeframe':
        if (!next) usage();
        out.timeframe = next;
        i += 1;
        break;
      case '--outputDir':
        if (!next) usage();
        out.outputDir = next;
        i += 1;
        break;
      case '--useRth':
        out.useRth = parseBoolean(next, true);
        i += 1;
        break;
      case '--continuous':
        out.continuous = parseBoolean(next, true);
        i += 1;
        break;
      case '--pacingSleepSeconds':
        out.pacingSleepSeconds = parseFloatOr(next, 11, 0);
        i += 1;
        break;
      default:
        usage();
    }
  }

  if (out.symbols.length === 0 || !out.start || !out.end) {
    usage();
  }

  return out;
};

const run = async (): Promise<void> => {
  const envFile = process.env.IBKR_BRIDGE_ENV_FILE
    ? path.resolve(process.cwd(), process.env.IBKR_BRIDGE_ENV_FILE)
    : path.resolve(process.cwd(), '.env.ibkr.bridge');
  loadEnvFile(envFile);

  const args = parseArgs(process.argv.slice(2));
  const pythonBin = process.env.IBKR_PYTHON_BIN ?? 'python3';
  const helperScript = path.resolve(process.cwd(), 'scripts/ibkr_tws_bridge.py');
  if (!fs.existsSync(helperScript)) {
    throw new Error(`Missing bridge script: ${helperScript}`);
  }

  const symbolMap = parseIbkrSymbolMapEnv(process.env.IBKR_BRIDGE_SYMBOL_MAP);
  const contractSpecs = parseIbkrContractSpecsEnv(process.env.IBKR_CONTRACT_SPECS_JSON);
  const resolvedContracts = args.symbols.map((symbol) => {
    const resolved = resolveIbkrContractSpec(symbol, symbolMap, contractSpecs);
    if (!resolved) {
      throw new Error(`Unsupported IBKR historical symbol: ${symbol}`);
    }
    return resolved;
  });

  const childArgs = [
    helperScript,
    'fetch-history',
    '--host',
    process.env.IBKR_HOST ?? '127.0.0.1',
    '--port',
    String(Number.parseInt(process.env.IBKR_PORT ?? '4002', 10)),
    '--client-id',
    String(Number.parseInt(process.env.IBKR_CLIENT_ID ?? '17002', 10)),
    '--contracts-json',
    JSON.stringify(resolvedContracts),
    '--start',
    args.start,
    '--end',
    args.end,
    '--bar-size',
    mapTimeframeToBarSize(args.timeframe),
    '--what-to-show',
    process.env.IBKR_WHAT_TO_SHOW ?? 'TRADES',
    '--output-dir',
    path.resolve(process.cwd(), args.outputDir),
    '--pacing-sleep-seconds',
    String(args.pacingSleepSeconds),
    '--log-prefix',
    '[ibkr-history]'
  ];

  if (args.useRth) {
    childArgs.push('--use-rth');
  }
  if (args.continuous) {
    childArgs.push('--continuous');
  }

  const child = spawn(pythonBin, childArgs, {
    stdio: 'inherit',
    env: process.env
  });

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signalName) => {
      if (signalName) {
        reject(new Error(`IBKR historical fetch stopped by signal ${signalName}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`IBKR historical fetch exited with code ${code ?? -1}`));
        return;
      }
      resolve();
    });
  });
};

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[ibkr-history] fatal: ${(error as Error).message}`);
  process.exit(1);
});
