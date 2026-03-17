import fs from 'node:fs/promises';
import path from 'node:path';
import type { SymbolCode } from '../domain/types.js';
import { defaultRankingModel } from '../services/rankingModel.js';
import {
  buildTrainingExamplesFromOneMinuteBars,
  evaluateTopPickWinRate,
  type OneMinuteBar,
  parseOneMinuteCsv,
  type TopPickWinRate,
  type TrainingExample,
  trainRankingModelFromExamples,
  type TrainingBuildOptions
} from '../training/historicalTrainer.js';

interface CliArgs {
  inputs: string[];
  inputDir?: string;
  recursive: boolean;
  output: string;
  symbol?: SymbolCode;
  validationPct: number;
  options: TrainingBuildOptions;
}

interface EvaluationSummary {
  baselineTopPick: TopPickWinRate;
  trainedTopPick: TopPickWinRate;
  delta: number;
}

const parseSymbol = (raw: string): SymbolCode => {
  const normalized = raw.trim().toUpperCase();
  const allowed: SymbolCode[] = ['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM'];
  if (!allowed.includes(normalized as SymbolCode)) {
    throw new Error(`Unsupported symbol override "${raw}". Allowed: ${allowed.join(', ')}`);
  }
  return normalized as SymbolCode;
};

const inferSymbolFromFileName = (filePath: string): SymbolCode | undefined => {
  const aliasToSymbol: Record<string, SymbolCode> = {
    MNQ: 'MNQ',
    MYM: 'MYM',
    NAS100: 'NAS100',
    US30: 'US30',
    ES: 'ES',
    SPY: 'ES',
    SPX: 'ES',
    GSPC: 'ES',
    US500: 'ES',
    USTEC: 'NAS100',
    US100: 'NAS100',
    DJ30: 'US30',
    DJI: 'US30',
    NQ: 'NQ',
    YM: 'YM'
  };

  const tokens = path
    .basename(filePath)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((token) => token.length > 0);

  const priority = ['MNQ', 'MYM', 'NAS100', 'US30', 'USTEC', 'US100', 'ES', 'SPY', 'SPX', 'GSPC', 'US500', 'DJ30', 'DJI', 'NQ', 'YM'];
  for (const key of priority) {
    if (tokens.includes(key)) {
      return aliasToSymbol[key];
    }
  }
  return undefined;
};

const toInt = (value: string, flag: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${flag}`);
  }
  return parsed;
};

const toPct = (value: string, flag: string): number => {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= 100) {
    throw new Error(`Invalid percentage for ${flag}. Expected a value from 0 to <100.`);
  }
  return parsed;
};

const usage = (): string =>
  [
    'Usage:',
    '  npm run train:model -- --input <one-minute-csv> [--input <more.csv>] [--output <model-json>]',
    '  npm run train:model -- --inputDir data/historical [--recursive]',
    '',
    'Optional:',
    '  --symbol NQ',
    '  --timezone America/New_York',
    '  --lookback1m 240',
    '  --lookahead1m 120',
    '  --step 5',
    '  --sessionStartHour 8 --sessionStartMinute 30',
    '  --sessionEndHour 11 --sessionEndMinute 30',
    '  --nyRangeMinutes 60',
    '  --validationPct 20'
  ].join('\n');

const valueFor = (argv: string[], index: number, token: string): string => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${token}`);
  }
  return value;
};

const parseArgs = (argv: string[]): CliArgs => {
  const out: CliArgs = {
    inputs: [],
    recursive: false,
    output: path.resolve(process.cwd(), 'data', 'models', 'latest-ranking-model.json'),
    validationPct: 20,
    options: {}
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!token.startsWith('--')) {
      continue;
    }

    if (token === '--recursive') {
      out.recursive = true;
      continue;
    }

    const value = valueFor(argv, i, token);

    switch (token) {
      case '--input':
        out.inputs.push(path.resolve(process.cwd(), value));
        i += 1;
        break;
      case '--inputDir':
        out.inputDir = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case '--output':
        out.output = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case '--symbol':
        out.symbol = parseSymbol(value);
        i += 1;
        break;
      case '--timezone':
        out.options.timezone = value;
        i += 1;
        break;
      case '--lookback1m':
        out.options.lookbackBars1m = toInt(value, token);
        i += 1;
        break;
      case '--lookahead1m':
        out.options.lookaheadBars1m = toInt(value, token);
        i += 1;
        break;
      case '--step':
        out.options.stepBars = toInt(value, token);
        i += 1;
        break;
      case '--sessionStartHour':
        out.options.sessionStartHour = toInt(value, token);
        i += 1;
        break;
      case '--sessionStartMinute':
        out.options.sessionStartMinute = toInt(value, token);
        i += 1;
        break;
      case '--sessionEndHour':
        out.options.sessionEndHour = toInt(value, token);
        i += 1;
        break;
      case '--sessionEndMinute':
        out.options.sessionEndMinute = toInt(value, token);
        i += 1;
        break;
      case '--nyRangeMinutes':
        out.options.nyRangeMinutes = toInt(value, token);
        i += 1;
        break;
      case '--validationPct':
        out.validationPct = toPct(value, token);
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (out.inputs.length === 0 && !out.inputDir) {
    throw new Error('Provide at least one --input file or an --inputDir');
  }

  return out;
};

const listCsvFiles = async (dirPath: string, recursive: boolean): Promise<string[]> => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        const nested = await listCsvFiles(fullPath, true);
        for (const file of nested) {
          out.push(file);
        }
      }
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
      out.push(fullPath);
    }
  }

  return out;
};

const resolveInputFiles = async (args: CliArgs): Promise<string[]> => {
  const files = new Set<string>();

  for (const input of args.inputs) {
    const stats = await fs.stat(input).catch(() => null);
    if (!stats || !stats.isFile()) {
      throw new Error(`Input file not found: ${input}`);
    }
    files.add(input);
  }

  if (args.inputDir) {
    const stats = await fs.stat(args.inputDir).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new Error(`Input directory not found: ${args.inputDir}`);
    }
    const csvFiles = await listCsvFiles(args.inputDir, args.recursive);
    for (const csvFile of csvFiles) {
      files.add(csvFile);
    }
  }

  const ordered = [...files].sort((a, b) => a.localeCompare(b));
  if (ordered.length === 0) {
    throw new Error('No CSV files found for training');
  }
  return ordered;
};

const dedupeBars = (bars: OneMinuteBar[]): OneMinuteBar[] => {
  const byKey = new Map<string, OneMinuteBar>();
  for (const bar of bars) {
    byKey.set(`${bar.symbol}|${bar.timestamp}`, bar);
  }

  return [...byKey.values()].sort((a, b) => {
    const t = a.timestamp.localeCompare(b.timestamp);
    if (t !== 0) {
      return t;
    }
    return a.symbol.localeCompare(b.symbol);
  });
};

const appendBars = (target: OneMinuteBar[], bars: OneMinuteBar[]): void => {
  for (const bar of bars) {
    target.push(bar);
  }
};

const splitExamples = (
  examples: TrainingExample[],
  validationPct: number
): { trainExamples: TrainingExample[]; validationExamples: TrainingExample[] } => {
  if (validationPct <= 0 || examples.length < 10) {
    return { trainExamples: examples, validationExamples: [] };
  }

  const sorted = examples
    .slice()
    .sort((a, b) => a.candidate.generatedAt.localeCompare(b.candidate.generatedAt));

  const holdoutCount = Math.floor(sorted.length * (validationPct / 100));
  if (holdoutCount <= 0 || holdoutCount >= sorted.length) {
    return { trainExamples: sorted, validationExamples: [] };
  }

  const splitAt = sorted.length - holdoutCount;
  return {
    trainExamples: sorted.slice(0, splitAt),
    validationExamples: sorted.slice(splitAt)
  };
};

const evaluateExamples = (examples: TrainingExample[], trainedModel: ReturnType<typeof trainRankingModelFromExamples>): EvaluationSummary => {
  const baselineTopPick = evaluateTopPickWinRate(examples, defaultRankingModel());
  const trainedTopPick = evaluateTopPickWinRate(examples, trainedModel);
  return {
    baselineTopPick,
    trainedTopPick,
    delta: trainedTopPick.winRate - baselineTopPick.winRate
  };
};

const run = async (): Promise<void> => {
  try {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      console.log(usage());
      return;
    }

    const parsed = parseArgs(process.argv.slice(2));
    const inputFiles = await resolveInputFiles(parsed);

    const allBarsRaw: OneMinuteBar[] = [];
    for (const inputFile of inputFiles) {
      const csv = await fs.readFile(inputFile, 'utf8');
      const symbolOverride = parsed.symbol ?? inferSymbolFromFileName(inputFile);
      const bars = parseOneMinuteCsv(csv, symbolOverride);
      appendBars(allBarsRaw, bars);
    }

    const allBars = dedupeBars(allBarsRaw);
    if (allBars.length === 0) {
      throw new Error('No valid one-minute bars were parsed');
    }

    const examples = buildTrainingExamplesFromOneMinuteBars(allBars, parsed.options);
    if (examples.length === 0) {
      throw new Error('No labeled examples were generated. Check symbol/session options and CSV coverage.');
    }

    const { trainExamples, validationExamples } = splitExamples(examples, parsed.validationPct);
    const validationModel = trainRankingModelFromExamples(trainExamples);
    const trainMetrics = evaluateExamples(trainExamples, validationModel);
    const validationMetrics =
      validationExamples.length > 0 ? evaluateExamples(validationExamples, validationModel) : null;

    // Final model is fit on the full historical set after diagnostics.
    const model = trainRankingModelFromExamples(examples);
    const fullMetrics = evaluateExamples(examples, model);

    const payload = {
      model,
      summary: {
        inputFileCount: inputFiles.length,
        parsedBarCount: allBarsRaw.length,
        uniqueBarCount: allBars.length,
        sampleCount: examples.length,
        trainExampleCount: trainExamples.length,
        validationExampleCount: validationExamples.length,
        fullHistory: fullMetrics,
        walkForward:
          validationMetrics === null
            ? null
            : {
                validationPct: parsed.validationPct,
                train: trainMetrics,
                validation: validationMetrics
              }
      },
      config: {
        inputs: inputFiles,
        inputDir: parsed.inputDir ?? null,
        recursive: parsed.recursive,
        symbolOverride: parsed.symbol ?? null,
        validationPct: parsed.validationPct,
        options: parsed.options
      }
    };

    await fs.mkdir(path.dirname(parsed.output), { recursive: true });
    await fs.writeFile(parsed.output, JSON.stringify(payload, null, 2), 'utf8');

    console.log(`Training complete.`);
    console.log(`Files processed: ${inputFiles.length}`);
    console.log(`Bars parsed: ${allBarsRaw.length}`);
    console.log(`Bars after dedupe: ${allBars.length}`);
    console.log(`Examples: ${examples.length}`);
    console.log(`Full-history baseline top-pick: ${(fullMetrics.baselineTopPick.winRate * 100).toFixed(2)}%`);
    console.log(`Full-history trained top-pick: ${(fullMetrics.trainedTopPick.winRate * 100).toFixed(2)}%`);
    console.log(`Full-history delta: ${(fullMetrics.delta * 100).toFixed(2)}%`);
    if (validationMetrics) {
      console.log(`Validation split: newest ${parsed.validationPct.toFixed(2)}%`);
      console.log(`Train delta: ${(trainMetrics.delta * 100).toFixed(2)}%`);
      console.log(`Validation delta: ${(validationMetrics.delta * 100).toFixed(2)}%`);
    } else {
      console.log(`Validation skipped (insufficient examples or validationPct=0).`);
    }
    console.log(`Model path: ${parsed.output}`);
    console.log(`Set env to use model: RANKING_MODEL_PATH=${parsed.output}`);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
};

void run();
