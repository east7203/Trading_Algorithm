import fs from 'node:fs';
import path from 'node:path';
import {
  YahooLiveBridge,
  parseYahooSymbolMapEnv,
  parseYahooSymbolsEnv
} from '../integrations/yahoo/yahooLiveBridge.js';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const parseIntOr = (value: string | undefined, fallback: number, min?: number): number => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (min !== undefined && parsed < min) {
    return min;
  }
  return parsed;
};

const optionalEnv = (name: string): string | undefined => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
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

const run = async (): Promise<void> => {
  const envFile = process.env.YAHOO_BRIDGE_ENV_FILE
    ? path.resolve(process.cwd(), process.env.YAHOO_BRIDGE_ENV_FILE)
    : path.resolve(process.cwd(), '.env.yahoo.bridge');
  loadEnvFile(envFile);

  const enabled = parseBoolean(process.env.YAHOO_BRIDGE_ENABLED, false);
  const symbols = parseYahooSymbolsEnv(process.env.YAHOO_BRIDGE_SYMBOLS);
  if (enabled && symbols.length === 0) {
    throw new Error('YAHOO_BRIDGE_SYMBOLS is required when bridge is enabled');
  }

  const bridge = new YahooLiveBridge({
    enabled,
    symbols,
    symbolMap: parseYahooSymbolMapEnv(process.env.YAHOO_BRIDGE_SYMBOL_MAP),
    interval: process.env.YAHOO_INTERVAL ?? '1m',
    range: process.env.YAHOO_RANGE ?? '1d',
    pollIntervalMs: parseIntOr(process.env.YAHOO_POLL_SECONDS, 60, 5) * 1000,
    overlapSeconds: parseIntOr(process.env.YAHOO_OVERLAP_SECONDS, 90, 1),
    maxBarsPerIngest: parseIntOr(process.env.YAHOO_MAX_BARS_PER_INGEST, 400, 1),
    yahooBaseUrl: (process.env.YAHOO_BASE_URL ?? 'https://query2.finance.yahoo.com').replace(
      /\/+$/,
      ''
    ),
    userAgent:
      process.env.YAHOO_USER_AGENT ??
      'Mozilla/5.0',
    requestRetries: parseIntOr(process.env.YAHOO_REQUEST_RETRIES, 3, 1),
    forceCurl: parseBoolean(process.env.YAHOO_FORCE_CURL, false),
    trainingApiBaseUrl: (process.env.TRAINING_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
      /\/+$/,
      ''
    ),
    trainingApiKey: optionalEnv('TRAINING_API_KEY'),
    trainingApiKeyHeader: process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key',
    reconnectMinMs: parseIntOr(process.env.YAHOO_RECONNECT_MIN_MS, 1_000, 250),
    reconnectMaxMs: parseIntOr(process.env.YAHOO_RECONNECT_MAX_MS, 60_000, 2_000),
    logPrefix: '[yahoo-bridge]'
  });

  await bridge.start();
  if (!enabled) {
    return;
  }

  const statusTimer = setInterval(() => {
    const status = bridge.status();
    // eslint-disable-next-line no-console
    console.log(
      `[yahoo-bridge] status polls=${status.polls} ingest_calls=${status.ingestCalls} ingested_bars=${status.ingestedBars} ` +
        `symbols=${status.trackedSymbols.map((s) => s.sourceSymbol).join(',')}`
    );
  }, 60_000);

  const shutdown = async (): Promise<void> => {
    clearInterval(statusTimer);
    await bridge.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[yahoo-bridge] fatal: ${(error as Error).message}`);
  process.exit(1);
});
