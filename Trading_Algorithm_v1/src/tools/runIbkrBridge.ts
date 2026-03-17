import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  parseIbkrContractSpecsEnv,
  parseIbkrSymbolMapEnv,
  parseIbkrSymbolsEnv,
  resolveIbkrContractSpec
} from '../integrations/ibkr/ibkrConfig.js';

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

const requiredEnv = (name: string, enabled: boolean): string => {
  const value = optionalEnv(name);
  if (!enabled) {
    return value ?? '';
  }
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const ensureNotPlaceholder = (name: string, value: string): void => {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.includes('your_') ||
    normalized.includes('replace_me') ||
    normalized.includes('example')
  ) {
    throw new Error(`Env ${name} still uses a placeholder value`);
  }
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
  const envFile = process.env.IBKR_BRIDGE_ENV_FILE
    ? path.resolve(process.cwd(), process.env.IBKR_BRIDGE_ENV_FILE)
    : path.resolve(process.cwd(), '.env.ibkr.bridge');
  loadEnvFile(envFile);

  const enabled = parseBoolean(process.env.IBKR_BRIDGE_ENABLED, false);
  const symbols = parseIbkrSymbolsEnv(process.env.IBKR_BRIDGE_SYMBOLS);
  if (enabled && symbols.length === 0) {
    throw new Error('IBKR_BRIDGE_SYMBOLS is required when bridge is enabled');
  }

  const pythonBin = process.env.IBKR_PYTHON_BIN ?? 'python3';
  const bridgeScript = path.resolve(process.cwd(), 'scripts/ibkr_tws_bridge.py');
  if (!fs.existsSync(bridgeScript)) {
    throw new Error(`Missing bridge script: ${bridgeScript}`);
  }

  const host = requiredEnv('IBKR_HOST', enabled) || '127.0.0.1';
  const port = parseIntOr(process.env.IBKR_PORT, 4002, 1);
  const clientId = parseIntOr(process.env.IBKR_CLIENT_ID, 17001, 1);
  const trainingApiBaseUrl = (process.env.TRAINING_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
    /\/+$/,
    ''
  );
  const notifyConnectedUrl = optionalEnv('IBKR_NOTIFY_CONNECTED_URL') ?? `${trainingApiBaseUrl}/notifications/ibkr/connected`;
  const notifyLoginRequiredUrl =
    optionalEnv('IBKR_NOTIFY_LOGIN_REQUIRED_URL') ??
    `${trainingApiBaseUrl}/notifications/ibkr/login-required`;

  if (enabled) {
    ensureNotPlaceholder('IBKR_HOST', host);
  }

  const symbolMap = parseIbkrSymbolMapEnv(process.env.IBKR_BRIDGE_SYMBOL_MAP);
  const contractSpecs = parseIbkrContractSpecsEnv(process.env.IBKR_CONTRACT_SPECS_JSON);
  const resolvedContracts = symbols.map((symbol) => {
    const resolved = resolveIbkrContractSpec(symbol, symbolMap, contractSpecs);
    if (!resolved) {
      throw new Error(`Unsupported IBKR bridge symbol: ${symbol}`);
    }
    return resolved;
  });

  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log('[ibkr-bridge] Bridge disabled (set IBKR_BRIDGE_ENABLED=true to run).');
    return;
  }

  const args = [
    bridgeScript,
    'live-bridge',
    '--host',
    host,
    '--port',
    String(port),
    '--client-id',
    String(clientId),
    '--contracts-json',
    JSON.stringify(resolvedContracts),
    '--training-api-base-url',
    trainingApiBaseUrl,
    '--notify-connected-url',
    notifyConnectedUrl,
    '--notify-login-required-url',
    notifyLoginRequiredUrl,
    '--training-api-key-header',
    process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key',
    '--initial-duration',
    process.env.IBKR_LIVE_INITIAL_DURATION ?? '1800 S',
    '--bar-size',
    process.env.IBKR_BAR_SIZE ?? '1 min',
    '--what-to-show',
    process.env.IBKR_WHAT_TO_SHOW ?? 'TRADES',
    '--max-bars-per-ingest',
    String(parseIntOr(process.env.IBKR_MAX_BARS_PER_INGEST, 400, 1)),
    '--status-seconds',
    String(parseIntOr(process.env.IBKR_STATUS_SECONDS, 60, 5)),
    '--reconnect-min-ms',
    String(parseIntOr(process.env.IBKR_RECONNECT_MIN_MS, 1_000, 250)),
    '--reconnect-max-ms',
    String(parseIntOr(process.env.IBKR_RECONNECT_MAX_MS, 60_000, 2_000)),
    '--startup-ready-timeout-seconds',
    String(parseIntOr(process.env.IBKR_STARTUP_READY_TIMEOUT_SECONDS, 90, 5)),
    '--contract-lookup-retries',
    String(parseIntOr(process.env.IBKR_CONTRACT_LOOKUP_RETRIES, 6, 1)),
    '--contract-lookup-retry-sleep-seconds',
    String(parseIntOr(process.env.IBKR_CONTRACT_LOOKUP_RETRY_SLEEP_SECONDS, 10, 1)),
    '--log-prefix',
    '[ibkr-bridge]'
  ];

  const trainingApiKey = optionalEnv('TRAINING_API_KEY');
  if (trainingApiKey) {
    args.push('--training-api-key', trainingApiKey);
  }
  const notifyApiKey = optionalEnv('IBKR_NOTIFY_CONNECTED_API_KEY') ?? trainingApiKey;
  if (notifyApiKey) {
    args.push('--notify-connected-api-key', notifyApiKey);
    args.push('--notify-connected-api-key-header', process.env.IBKR_NOTIFY_CONNECTED_API_KEY_HEADER ?? process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key');
    args.push('--notify-login-required-api-key', notifyApiKey);
    args.push(
      '--notify-login-required-api-key-header',
      process.env.IBKR_NOTIFY_LOGIN_REQUIRED_API_KEY_HEADER ??
        process.env.TRAINING_API_KEY_HEADER ??
        'x-api-key'
    );
  }
  if (parseBoolean(process.env.IBKR_USE_RTH, false)) {
    args.push('--use-rth');
  }

  const child = spawn(pythonBin, args, {
    stdio: 'inherit',
    env: process.env
  });

  const stopChild = (signalName: NodeJS.Signals): void => {
    if (!child.killed) {
      child.kill(signalName);
    }
  };

  process.on('SIGINT', () => stopChild('SIGINT'));
  process.on('SIGTERM', () => stopChild('SIGTERM'));

  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signalName) => {
      if (signalName) {
        reject(new Error(`IBKR bridge stopped by signal ${signalName}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`IBKR bridge exited with code ${code ?? -1}`));
        return;
      }
      resolve();
    });
  });
};

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[ibkr-bridge] fatal: ${(error as Error).message}`);
  process.exit(1);
});
