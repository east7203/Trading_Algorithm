import fs from 'node:fs/promises';
import path from 'node:path';

interface CliArgs {
  symbols: string[];
  start: string;
  end?: string;
  dataset: string;
  schema: string;
  stypeIn: string;
  outputDir: string;
  encoding: string;
  compression: string;
}

const usage = (): string =>
  [
    'Usage:',
    '  DATABENTO_API_KEY=... npm run fetch:databento -- --symbols NQ.FUT,ES.FUT --start 2024-01-01T00:00:00Z [--end 2026-01-01T00:00:00Z]',
    '',
    'Optional:',
    '  --dataset GLBX.MDP3',
    '  --schema ohlcv-1m',
    '  --stypeIn parent',
    '  --outputDir data/historical',
    '  --encoding csv',
    '  --compression none'
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
    symbols: [],
    start: '',
    dataset: 'GLBX.MDP3',
    schema: 'ohlcv-1m',
    stypeIn: 'parent',
    outputDir: path.resolve(process.cwd(), 'data', 'historical'),
    encoding: 'csv',
    compression: 'none'
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
        out.symbols = value
          .split(',')
          .map((part) => part.trim())
          .filter((part) => part.length > 0);
        i += 1;
        break;
      case '--start':
        out.start = value;
        i += 1;
        break;
      case '--end':
        out.end = value;
        i += 1;
        break;
      case '--dataset':
        out.dataset = value;
        i += 1;
        break;
      case '--schema':
        out.schema = value;
        i += 1;
        break;
      case '--stypeIn':
        out.stypeIn = value;
        i += 1;
        break;
      case '--outputDir':
        out.outputDir = path.resolve(process.cwd(), value);
        i += 1;
        break;
      case '--encoding':
        out.encoding = value;
        i += 1;
        break;
      case '--compression':
        out.compression = value;
        i += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (out.symbols.length === 0) {
    throw new Error('Provide at least one symbol via --symbols');
  }
  if (!out.start) {
    throw new Error('Missing --start argument');
  }
  const startMs = Date.parse(out.start);
  if (Number.isNaN(startMs)) {
    throw new Error(`Invalid --start timestamp: ${out.start}`);
  }
  if (out.end) {
    const endMs = Date.parse(out.end);
    if (Number.isNaN(endMs)) {
      throw new Error(`Invalid --end timestamp: ${out.end}`);
    }
    if (endMs <= startMs) {
      throw new Error('--end must be greater than --start');
    }
  }

  return out;
};

const sanitize = (value: string): string =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_');

const requestUrl = (args: CliArgs, symbol: string): string => {
  const query = new URLSearchParams({
    dataset: args.dataset,
    schema: args.schema,
    stype_in: args.stypeIn,
    symbols: symbol,
    start: args.start,
    encoding: args.encoding,
    compression: args.compression
  });
  if (args.end) {
    query.set('end', args.end);
  }
  return `https://hist.databento.com/v0/timeseries.get_range?${query.toString()}`;
};

const outputFilePath = (args: CliArgs, symbol: string): string => {
  const startTag = sanitize(args.start).replace(/[:]/g, '-');
  const endTag = sanitize(args.end ?? 'now').replace(/[:]/g, '-');
  const symbolTag = sanitize(symbol);
  const schemaTag = sanitize(args.schema);
  return path.join(args.outputDir, `databento_${symbolTag}_${schemaTag}_${startTag}_${endTag}.csv`);
};

const run = async (): Promise<void> => {
  try {
    const apiKey = process.env.DATABENTO_API_KEY;
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error('Missing DATABENTO_API_KEY environment variable');
    }

    const args = parseArgs(process.argv.slice(2));
    await fs.mkdir(args.outputDir, { recursive: true });

    const authHeader = `Basic ${Buffer.from(`${apiKey.trim()}:`).toString('base64')}`;
    const outputFiles: string[] = [];

    for (const symbol of args.symbols) {
      const url = requestUrl(args, symbol);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'text/csv'
        }
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Databento request failed for ${symbol} (HTTP ${response.status}): ${errorBody.slice(0, 500)}`
        );
      }

      const csv = await response.text();
      if (csv.trim().length === 0) {
        throw new Error(`Databento returned empty CSV for symbol ${symbol}`);
      }

      const outputPath = outputFilePath(args, symbol);
      await fs.writeFile(outputPath, csv, 'utf8');
      outputFiles.push(outputPath);
      console.log(`Saved ${symbol}: ${outputPath}`);
    }

    console.log(`Downloaded ${outputFiles.length} file(s).`);
    console.log(
      `Next step: npm run train:model -- ${outputFiles.map((file) => `--input ${file}`).join(' ')}`
    );
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
};

void run();
