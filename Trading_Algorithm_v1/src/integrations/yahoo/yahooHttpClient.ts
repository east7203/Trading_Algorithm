import { execFile } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

export interface YahooHttpJsonOptions {
  userAgent: string;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  forceCurl?: boolean;
}

interface HttpResponse {
  status: number;
  body: string;
}

const execFileAsync = promisify(execFile);

const retryWaitMs = (attempt: number, baseDelayMs: number, maxDelayMs: number): number =>
  Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));

const fetchWithNode = async (url: string, userAgent: string): Promise<HttpResponse> => {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent
    }
  });
  return {
    status: response.status,
    body: await response.text()
  };
};

const fetchWithCurl = async (url: string, userAgent: string): Promise<HttpResponse> => {
  const { stdout } = await execFileAsync(
    'curl',
    ['-sS', '-L', '-H', `User-Agent: ${userAgent}`, '-H', 'Accept: application/json', '-w', '\n%{http_code}', url],
    { maxBuffer: 20 * 1024 * 1024 }
  );

  const splitIndex = stdout.lastIndexOf('\n');
  if (splitIndex < 0) {
    throw new Error('Unexpected curl response format');
  }

  const body = stdout.slice(0, splitIndex);
  const status = Number.parseInt(stdout.slice(splitIndex + 1).trim(), 10);
  if (!Number.isFinite(status)) {
    throw new Error('Could not parse curl HTTP status');
  }

  return {
    status,
    body
  };
};

const requestYahoo = async (
  url: string,
  userAgent: string,
  forceCurl: boolean
): Promise<HttpResponse> => {
  if (forceCurl) {
    return fetchWithCurl(url, userAgent);
  }

  const response = await fetchWithNode(url, userAgent);
  if (response.status === 429) {
    return fetchWithCurl(url, userAgent);
  }
  return response;
};

export const getYahooJson = async (
  url: string,
  options: YahooHttpJsonOptions
): Promise<unknown> => {
  const retries = Math.max(1, options.retries ?? 4);
  const baseDelayMs = Math.max(100, options.baseDelayMs ?? 500);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 10_000);
  const forceCurl = options.forceCurl ?? false;
  let lastError = 'Unknown Yahoo error';

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await requestYahoo(url, options.userAgent, forceCurl);
    if (response.status >= 200 && response.status < 300) {
      try {
        return JSON.parse(response.body);
      } catch {
        throw new Error('Yahoo returned non-JSON response');
      }
    }

    lastError = `Yahoo request failed (HTTP ${response.status}): ${response.body.slice(0, 500)}`;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(lastError);
    }

    await sleep(retryWaitMs(attempt, baseDelayMs, maxDelayMs));
  }

  throw new Error(lastError);
};
