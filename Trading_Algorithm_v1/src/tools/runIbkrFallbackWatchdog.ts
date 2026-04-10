import { execFile } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface DiagnosticsResponse {
  diagnostics?: {
    liveFeedStatus?: string;
    latestBarTimestamp?: string;
  };
}

interface Pm2ProcessSummary {
  name?: string;
  pm2_env?: {
    status?: string;
  };
}

export interface WatchdogEvaluationInput {
  liveFeedStatus: string;
  nowMs: number;
  staleSinceMs?: number;
  thresholdMs: number;
  yahooOnline: boolean;
  primaryReady: boolean;
}

export interface WatchdogEvaluationResult {
  nextStaleSinceMs?: number;
  shouldActivateFallback: boolean;
  shouldDeactivateFallback: boolean;
  primaryReady: boolean;
}

export const evaluateFallbackWatchdog = (
  input: WatchdogEvaluationInput
): WatchdogEvaluationResult => {
  if (input.primaryReady) {
    return {
      nextStaleSinceMs: undefined,
      shouldActivateFallback: false,
      shouldDeactivateFallback: input.yahooOnline,
      primaryReady: true
    };
  }

  const normalizedStatus = input.liveFeedStatus.trim().toUpperCase();
  if (normalizedStatus === 'LIVE') {
    return {
      nextStaleSinceMs: undefined,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      primaryReady: false
    };
  }

  const nextStaleSinceMs = input.staleSinceMs ?? input.nowMs;
  if (input.yahooOnline) {
    return {
      nextStaleSinceMs,
      shouldActivateFallback: false,
      shouldDeactivateFallback: false,
      primaryReady: false
    };
  }

  return {
    nextStaleSinceMs,
    shouldActivateFallback: input.nowMs - nextStaleSinceMs >= input.thresholdMs,
    shouldDeactivateFallback: false,
    primaryReady: false
  };
};

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

const loadEnvFile = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
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

const runCommand = async (command: string, args: string[]): Promise<string> =>
  await new Promise<string>((resolve, reject) => {
    execFile(command, args, { maxBuffer: 1024 * 1024 * 8 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || stdout || error.message));
        return;
      }
      resolve(stdout);
    });
  });

const getPm2ProcessStatus = async (name: string): Promise<string | undefined> => {
  const raw = await runCommand('pm2', ['jlist']);
  const entries = JSON.parse(raw) as Pm2ProcessSummary[];
  const match = entries.find((entry) => entry.name === name);
  return match?.pm2_env?.status;
};

const isPortListening = async (host: string, port: number, timeoutMs = 1500): Promise<boolean> =>
  await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(timeoutMs, () => finish(false));
  });

const startYahooFallback = async (): Promise<void> => {
  await runCommand('pm2', ['restart', 'yahoo-bridge', '--update-env']);
  await runCommand('pm2', ['save']);
};

const stopYahooFallback = async (): Promise<void> => {
  await runCommand('pm2', ['stop', 'yahoo-bridge']);
  await runCommand('pm2', ['save']);
};

const postJson = async (
  url: string,
  payload: Record<string, unknown>,
  apiKey?: string,
  apiKeyHeader = 'x-api-key'
): Promise<void> => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { [apiKeyHeader]: apiKey } : {})
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
};

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const run = async (): Promise<void> => {
  const envFile = process.env.IBKR_FALLBACK_WATCHDOG_ENV_FILE
    ? path.resolve(process.cwd(), process.env.IBKR_FALLBACK_WATCHDOG_ENV_FILE)
    : path.resolve(process.cwd(), '.env.ibkr.bridge');
  loadEnvFile(envFile);

  const enabled = parseBoolean(process.env.IBKR_FALLBACK_WATCHDOG_ENABLED, true);
  if (!enabled) {
    // eslint-disable-next-line no-console
    console.log('[ibkr-fallback-watchdog] disabled');
    return;
  }

  const diagnosticsUrl = `${(process.env.TRAINING_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')}/diagnostics`;
  const fallbackNotifyUrl = `${(process.env.TRAINING_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')}/notifications/ibkr/fallback-activated`;
  const trainingApiKey = process.env.TRAINING_API_KEY?.trim() || undefined;
  const trainingApiKeyHeader = process.env.TRAINING_API_KEY_HEADER ?? 'x-api-key';
  const checkIntervalMs = parseIntOr(process.env.IBKR_FALLBACK_WATCHDOG_CHECK_SECONDS, 60, 5) * 1000;
  const staleThresholdMs =
    parseIntOr(process.env.IBKR_FALLBACK_WATCHDOG_STALE_MINUTES, 8, 1) * 60 * 1000;
  const ibkrHost = process.env.IBKR_HOST ?? '127.0.0.1';
  const ibkrPort = parseIntOr(process.env.IBKR_PORT, 4001, 1);

  let staleSinceMs: number | undefined;
  let fallbackActivated = false;

  while (true) {
    try {
      const diagnosticsResponse = await fetch(diagnosticsUrl);
      if (!diagnosticsResponse.ok) {
        throw new Error(`diagnostics HTTP ${diagnosticsResponse.status}`);
      }
      const diagnostics = (await diagnosticsResponse.json()) as DiagnosticsResponse;
      const liveFeedStatus = diagnostics.diagnostics?.liveFeedStatus ?? 'UNKNOWN';
      const latestBarTimestamp = diagnostics.diagnostics?.latestBarTimestamp;
      const yahooStatus = await getPm2ProcessStatus('yahoo-bridge');
      const yahooOnline = yahooStatus === 'online';
      const ibkrBridgeOnline = (await getPm2ProcessStatus('ibkr-bridge')) === 'online';
      const ibkrApiReady = await isPortListening(ibkrHost, ibkrPort);

      const decision = evaluateFallbackWatchdog({
        liveFeedStatus,
        nowMs: Date.now(),
        staleSinceMs,
        thresholdMs: staleThresholdMs,
        yahooOnline,
        primaryReady: ibkrBridgeOnline && ibkrApiReady
      });
      staleSinceMs = decision.nextStaleSinceMs;

      if (decision.primaryReady) {
        fallbackActivated = false;
      }

      if (decision.shouldDeactivateFallback) {
        await stopYahooFallback();
        fallbackActivated = false;
        // eslint-disable-next-line no-console
        console.log('[ibkr-fallback-watchdog] Yahoo fallback stopped after IBKR primary feed recovered.');
      }

      if (decision.shouldActivateFallback && !fallbackActivated) {
        await startYahooFallback();
        fallbackActivated = true;
        await postJson(
          fallbackNotifyUrl,
          {
            source: 'ibkr-fallback-watchdog',
            activatedAt: new Date().toISOString(),
            latestBarTimestamp,
            liveFeedStatus,
            staleMinutes: Math.round(staleThresholdMs / (60 * 1000))
          },
          trainingApiKey,
          trainingApiKeyHeader
        );
        // eslint-disable-next-line no-console
        console.log('[ibkr-fallback-watchdog] Yahoo fallback restarted after stale feed detection.');
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[ibkr-fallback-watchdog] ${(error as Error).message}`);
    }

    await sleep(checkIntervalMs);
  }
};

const isDirectRun = (() => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(entry).href;
})();

if (isDirectRun) {
  void run().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[ibkr-fallback-watchdog] fatal: ${(error as Error).message}`);
    process.exit(1);
  });
}
