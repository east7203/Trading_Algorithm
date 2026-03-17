import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

interface OvernightConfig {
  tickers: string[];
  symbolMap: string;
  startDate: string;
  endDate: string;
  outputRoot: string;
  polygonRequestDelayMs: number;
  polygonRetries: number;
  trainValidationPct: number;
  trainStep: number;
  trainLookback1m: number;
  trainLookahead1m: number;
  trainOutput: string;
}

const execFileAsync = promisify(execFile);

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

const parseList = (raw: string | undefined, fallback: string[]): string[] => {
  if (!raw || raw.trim().length === 0) {
    return fallback;
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const parseIntOr = (raw: string | undefined, fallback: number, min = 1): number => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, parsed);
};

const parseFloatOr = (raw: string | undefined, fallback: number): number => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed;
};

const nowDate = (): string => new Date().toISOString().slice(0, 10);

const resolveConfig = (): OvernightConfig => {
  const cwd = process.cwd();
  const defaultOutputRoot = path.resolve(cwd, 'data', 'historical', 'polygon-overnight');

  return {
    tickers: parseList(process.env.POLYGON_OVERNIGHT_TICKERS, ['QQQ', 'DIA']),
    symbolMap: process.env.POLYGON_OVERNIGHT_SYMBOL_MAP ?? '{"QQQ":"NQ","DIA":"YM"}',
    startDate: process.env.POLYGON_OVERNIGHT_START ?? '2024-01-01',
    endDate: process.env.POLYGON_OVERNIGHT_END ?? nowDate(),
    outputRoot: path.resolve(cwd, process.env.POLYGON_OVERNIGHT_OUTPUT_ROOT ?? defaultOutputRoot),
    polygonRequestDelayMs: parseIntOr(process.env.POLYGON_OVERNIGHT_REQUEST_DELAY_MS, 1500, 200),
    polygonRetries: parseIntOr(process.env.POLYGON_OVERNIGHT_RETRIES, 30, 1),
    trainValidationPct: parseFloatOr(process.env.POLYGON_OVERNIGHT_VALIDATION_PCT, 20),
    trainStep: parseIntOr(process.env.POLYGON_OVERNIGHT_STEP, 1, 1),
    trainLookback1m: parseIntOr(process.env.POLYGON_OVERNIGHT_LOOKBACK_1M, 240, 60),
    trainLookahead1m: parseIntOr(process.env.POLYGON_OVERNIGHT_LOOKAHEAD_1M, 120, 10),
    trainOutput: path.resolve(
      cwd,
      process.env.POLYGON_OVERNIGHT_MODEL_OUTPUT ??
        path.resolve(cwd, 'data', 'models', 'latest-ranking-model.json')
    )
  };
};

const runNodeTool = async (
  toolRelativePath: string,
  args: string[],
  label: string,
  retries = 1
): Promise<void> => {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      // eslint-disable-next-line no-console
      console.log(`[overnight] ${label} (attempt ${attempt}/${retries})`);
      const toolPath = path.resolve(process.cwd(), toolRelativePath);
      const { stdout, stderr } = await execFileAsync(process.execPath, [toolPath, ...args], {
        cwd: process.cwd(),
        maxBuffer: 50 * 1024 * 1024,
        env: process.env
      });
      if (stdout.trim().length > 0) {
        // eslint-disable-next-line no-console
        console.log(stdout.trim());
      }
      if (stderr.trim().length > 0) {
        // eslint-disable-next-line no-console
        console.error(stderr.trim());
      }
      return;
    } catch (error) {
      const err = error as {
        stdout?: string;
        stderr?: string;
        message: string;
      };
      lastError = err.stderr?.trim() || err.stdout?.trim() || err.message;
      // eslint-disable-next-line no-console
      console.error(`[overnight] ${label} failed: ${lastError}`);
      if (attempt >= retries) {
        throw new Error(lastError);
      }
      const waitMs = Math.min(60_000, 3_000 * 2 ** (attempt - 1));
      // eslint-disable-next-line no-console
      console.log(`[overnight] waiting ${waitMs}ms before retry`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
};

const ensureApiKey = (): void => {
  const key = process.env.POLYGON_API_KEY;
  if (!key || key.trim().length === 0) {
    throw new Error('POLYGON_API_KEY is required (set .env.polygon or env var)');
  }
};

const run = async (): Promise<void> => {
  const polygonEnvFile = process.env.POLYGON_ENV_FILE
    ? path.resolve(process.cwd(), process.env.POLYGON_ENV_FILE)
    : path.resolve(process.cwd(), '.env.polygon');
  const overnightEnvFile = process.env.OVERNIGHT_ENV_FILE
    ? path.resolve(process.cwd(), process.env.OVERNIGHT_ENV_FILE)
    : path.resolve(process.cwd(), '.env.overnight');

  loadEnvFile(polygonEnvFile);
  loadEnvFile(overnightEnvFile);
  ensureApiKey();

  const cfg = resolveConfig();
  const minuteDir = path.join(cfg.outputRoot, 'minute');
  const minute5Dir = path.join(cfg.outputRoot, 'minute-5');
  const minute15Dir = path.join(cfg.outputRoot, 'minute-15');
  const hourDir = path.join(cfg.outputRoot, 'hour');
  const dayDir = path.join(cfg.outputRoot, 'day');
  const weekDir = path.join(cfg.outputRoot, 'week');

  // eslint-disable-next-line no-console
  console.log('[overnight] starting polygon overnight training job');
  // eslint-disable-next-line no-console
  console.log(
    `[overnight] tickers=${cfg.tickers.join(',')} start=${cfg.startDate} end=${cfg.endDate}`
  );

  await runNodeTool(
    'dist/tools/fetchPolygonHistorical.js',
    [
      '--tickers',
      cfg.tickers.join(','),
      '--start',
      cfg.startDate,
      '--end',
      cfg.endDate,
      '--timespan',
      'minute',
      '--multiplier',
      '1',
      '--outputDir',
      minuteDir,
      '--symbolMap',
      cfg.symbolMap,
      '--requestDelayMs',
      String(cfg.polygonRequestDelayMs),
      '--retries',
      String(cfg.polygonRetries)
    ],
    'fetch minute data',
    3
  );

  await runNodeTool(
    'dist/tools/fetchPolygonHistorical.js',
    [
      '--tickers',
      cfg.tickers.join(','),
      '--start',
      cfg.startDate,
      '--end',
      cfg.endDate,
      '--timespan',
      'minute',
      '--multiplier',
      '5',
      '--outputDir',
      minute5Dir,
      '--symbolMap',
      cfg.symbolMap,
      '--requestDelayMs',
      String(Math.max(600, Math.floor(cfg.polygonRequestDelayMs * 0.75))),
      '--retries',
      String(cfg.polygonRetries)
    ],
    'fetch 5m data',
    2
  );

  await runNodeTool(
    'dist/tools/fetchPolygonHistorical.js',
    [
      '--tickers',
      cfg.tickers.join(','),
      '--start',
      cfg.startDate,
      '--end',
      cfg.endDate,
      '--timespan',
      'minute',
      '--multiplier',
      '15',
      '--outputDir',
      minute15Dir,
      '--symbolMap',
      cfg.symbolMap,
      '--requestDelayMs',
      String(Math.max(500, Math.floor(cfg.polygonRequestDelayMs * 0.6))),
      '--retries',
      String(cfg.polygonRetries)
    ],
    'fetch 15m data',
    2
  );

  await runNodeTool(
    'dist/tools/fetchPolygonHistorical.js',
    [
      '--tickers',
      cfg.tickers.join(','),
      '--start',
      cfg.startDate,
      '--end',
      cfg.endDate,
      '--timespan',
      'hour',
      '--multiplier',
      '1',
      '--outputDir',
      hourDir,
      '--symbolMap',
      cfg.symbolMap,
      '--requestDelayMs',
      String(Math.max(400, Math.floor(cfg.polygonRequestDelayMs / 2))),
      '--retries',
      String(cfg.polygonRetries)
    ],
    'fetch hour data',
    2
  );

  await runNodeTool(
    'dist/tools/fetchPolygonHistorical.js',
    [
      '--tickers',
      cfg.tickers.join(','),
      '--start',
      cfg.startDate,
      '--end',
      cfg.endDate,
      '--timespan',
      'day',
      '--multiplier',
      '1',
      '--outputDir',
      dayDir,
      '--symbolMap',
      cfg.symbolMap,
      '--requestDelayMs',
      String(Math.max(250, Math.floor(cfg.polygonRequestDelayMs / 3))),
      '--retries',
      String(cfg.polygonRetries)
    ],
    'fetch day data',
    2
  );

  await runNodeTool(
    'dist/tools/fetchPolygonHistorical.js',
    [
      '--tickers',
      cfg.tickers.join(','),
      '--start',
      cfg.startDate,
      '--end',
      cfg.endDate,
      '--timespan',
      'week',
      '--multiplier',
      '1',
      '--outputDir',
      weekDir,
      '--symbolMap',
      cfg.symbolMap,
      '--requestDelayMs',
      String(Math.max(250, Math.floor(cfg.polygonRequestDelayMs / 3))),
      '--retries',
      String(cfg.polygonRetries)
    ],
    'fetch week data',
    2
  );

  await runNodeTool(
    'dist/tools/trainRankingModel.js',
    [
      '--inputDir',
      minuteDir,
      '--recursive',
      '--validationPct',
      String(cfg.trainValidationPct),
      '--step',
      String(cfg.trainStep),
      '--lookback1m',
      String(cfg.trainLookback1m),
      '--lookahead1m',
      String(cfg.trainLookahead1m),
      '--output',
      cfg.trainOutput
    ],
    'train ranking model',
    1
  );

  // eslint-disable-next-line no-console
  console.log(`[overnight] completed. model=${cfg.trainOutput}`);
  // eslint-disable-next-line no-console
  console.log(
    '[overnight] restart API with this env to apply model: RANKING_MODEL_PATH=' +
      `${cfg.trainOutput} pm2 restart trading-api --update-env`
  );
};

void run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[overnight] fatal: ${(error as Error).message}`);
  process.exit(1);
});
