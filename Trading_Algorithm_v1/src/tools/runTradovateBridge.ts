import { TradovateBridge, parseSymbolMapEnv, parseSymbolsEnv } from '../integrations/tradovate/tradovateBridge.js';
import fs from 'node:fs';
import path from 'node:path';

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
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

const requiredEnv = (name: string, enabled: boolean): string => {
  const value = process.env[name];
  if (!enabled) {
    return value ?? '';
  }
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value.trim();
};

const optionalEnv = (name: string): string | undefined => {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
};

const optionalIntEnv = (name: string): number | undefined => {
  const value = optionalEnv(name);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer env: ${name}`);
  }
  return parsed;
};

const run = async (): Promise<void> => {
  const envFile = process.env.BRIDGE_ENV_FILE
    ? path.resolve(process.cwd(), process.env.BRIDGE_ENV_FILE)
    : path.resolve(process.cwd(), '.env.bridge');
  loadEnvFile(envFile);

  const enabled = parseBoolean(process.env.TRADOVATE_BRIDGE_ENABLED, false);
  const symbols = parseSymbolsEnv(process.env.TRADOVATE_BRIDGE_SYMBOLS);
  if (enabled && symbols.length === 0) {
    throw new Error('TRADOVATE_BRIDGE_SYMBOLS is required when bridge is enabled (example: NQM6,ESM6)');
  }

  const bridge = new TradovateBridge({
    enabled,
    tradovateApiUrl: (process.env.TRADOVATE_API_URL ?? 'https://demo.tradovateapi.com/v1').replace(/\/+$/, ''),
    tradovateMdWsUrl: process.env.TRADOVATE_MD_WS_URL ?? 'wss://md.tradovateapi.com/v1/websocket',
    username: requiredEnv('TRADOVATE_USERNAME', enabled),
    password: requiredEnv('TRADOVATE_PASSWORD', enabled),
    appId: optionalEnv('TRADOVATE_APP_ID'),
    appVersion: optionalEnv('TRADOVATE_APP_VERSION'),
    cid: optionalIntEnv('TRADOVATE_CID'),
    sec: optionalEnv('TRADOVATE_SEC'),
    symbols,
    symbolMap: parseSymbolMapEnv(process.env.TRADOVATE_SYMBOL_MAP),
    chartHistoryBars: parseIntOr(process.env.TRADOVATE_CHART_HISTORY_BARS, 300, 50),
    trainingApiBaseUrl: (process.env.TRAINING_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, ''),
    trainingApiKey: process.env.TRAINING_API_KEY,
    trainingApiKeyHeader: process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key',
    reconnectMinMs: parseIntOr(process.env.TRADOVATE_RECONNECT_MIN_MS, 1_000, 250),
    reconnectMaxMs: parseIntOr(process.env.TRADOVATE_RECONNECT_MAX_MS, 60_000, 2_000),
    logPrefix: '[tradovate-bridge]'
  });

  await bridge.start();
  if (!enabled) {
    return;
  }

  const statusTimer = setInterval(() => {
    const status = bridge.status();
    // eslint-disable-next-line no-console
    console.log(
      `[tradovate-bridge] status connected=${status.connected} authenticated=${status.authenticated} ` +
        `bars=${status.ingestedBars} calls=${status.ingestCalls} subscribed=${status.subscribedSymbols.join(',') || 'none'}`
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
  console.error(`[tradovate-bridge] fatal: ${(error as Error).message}`);
  process.exit(1);
});
