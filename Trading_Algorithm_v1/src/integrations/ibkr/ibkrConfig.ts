import type { SymbolCode } from '../../domain/types.js';

export interface IbkrContractSpec {
  symbol: string;
  exchange: string;
  currency: string;
  multiplier?: string;
  secType?: 'FUT' | 'CONTFUT';
  lastTradeDateOrContractMonth?: string;
  localSymbol?: string;
  includeExpired?: boolean;
}

const defaultSymbolAliases: Record<string, SymbolCode> = {
  NAS100: 'NAS100',
  US30: 'US30',
  US100: 'NAS100',
  USTEC: 'NAS100',
  ES: 'ES',
  MES: 'ES',
  SPY: 'ES',
  SPX: 'ES',
  GSPC: 'ES',
  US500: 'ES',
  DJ30: 'US30',
  DJI: 'US30',
  NQ: 'NQ',
  YM: 'YM',
  MNQ: 'MNQ',
  MYM: 'MYM'
};

const defaultContractSpecs: Record<SymbolCode, IbkrContractSpec> = {
  NAS100: {
    symbol: 'NQ',
    exchange: 'CME',
    currency: 'USD',
    multiplier: '20',
    secType: 'FUT'
  },
  US30: {
    symbol: 'YM',
    exchange: 'CBOT',
    currency: 'USD',
    multiplier: '5',
    secType: 'FUT'
  },
  NQ: {
    symbol: 'NQ',
    exchange: 'CME',
    currency: 'USD',
    multiplier: '20',
    secType: 'FUT'
  },
  ES: {
    symbol: 'ES',
    exchange: 'CME',
    currency: 'USD',
    multiplier: '50',
    secType: 'FUT'
  },
  YM: {
    symbol: 'YM',
    exchange: 'CBOT',
    currency: 'USD',
    multiplier: '5',
    secType: 'FUT'
  },
  MNQ: {
    symbol: 'MNQ',
    exchange: 'CME',
    currency: 'USD',
    multiplier: '2',
    secType: 'FUT'
  },
  MYM: {
    symbol: 'MYM',
    exchange: 'CBOT',
    currency: 'USD',
    multiplier: '0.5',
    secType: 'FUT'
  }
};

const tokenizeSymbol = (raw: string): string[] =>
  raw
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const inferSymbol = (raw: string): SymbolCode | null => {
  const tokens = tokenizeSymbol(raw);
  const candidates = tokens.length > 0 ? tokens : [raw.toUpperCase()];
  const priority = ['MNQ', 'MYM', 'NAS100', 'US30', 'USTEC', 'US100', 'ES', 'MES', 'SPY', 'SPX', 'GSPC', 'US500', 'DJ30', 'DJI', 'NQ', 'YM'];

  for (const token of candidates) {
    for (const key of priority) {
      if (token === key || token.startsWith(key)) {
        return defaultSymbolAliases[key];
      }
    }
  }

  return null;
};

export const mapIbkrSymbol = (
  sourceSymbol: string,
  customMap: Partial<Record<string, SymbolCode>> = {}
): SymbolCode | null => {
  const normalized = sourceSymbol.trim().toUpperCase();
  if (normalized.length === 0) {
    return null;
  }
  const exactCustom = customMap[normalized];
  if (exactCustom) {
    return exactCustom;
  }
  if (normalized in defaultSymbolAliases) {
    return defaultSymbolAliases[normalized as keyof typeof defaultSymbolAliases];
  }
  return inferSymbol(normalized);
};

export const resolveIbkrContractSpec = (
  sourceSymbol: string,
  customSymbolMap: Partial<Record<string, SymbolCode>> = {},
  customSpecs: Partial<Record<string, IbkrContractSpec>> = {}
): { sourceSymbol: string; targetSymbol: SymbolCode; contract: IbkrContractSpec } | null => {
  const normalizedSource = sourceSymbol.trim().toUpperCase();
  const targetSymbol = mapIbkrSymbol(normalizedSource, customSymbolMap);
  if (!targetSymbol) {
    return null;
  }

  const exactCustom = customSpecs[normalizedSource];
  if (exactCustom) {
    return {
      sourceSymbol: normalizedSource,
      targetSymbol,
      contract: {
        ...exactCustom,
        secType: exactCustom.secType ?? 'FUT'
      }
    };
  }

  const fallbackCustom = customSpecs[targetSymbol];
  if (fallbackCustom) {
    return {
      sourceSymbol: normalizedSource,
      targetSymbol,
      contract: {
        ...fallbackCustom,
        secType: fallbackCustom.secType ?? 'FUT'
      }
    };
  }

  return {
    sourceSymbol: normalizedSource,
    targetSymbol,
    contract: {
      ...defaultContractSpecs[targetSymbol],
      secType: defaultContractSpecs[targetSymbol].secType ?? 'FUT'
    }
  };
};

export const parseIbkrSymbolsEnv = (raw: string | undefined): string[] => {
  if (!raw || raw.trim().length === 0) {
    return [];
  }
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

export const parseIbkrSymbolMapEnv = (
  raw: string | undefined
): Partial<Record<string, SymbolCode>> => {
  if (!raw || raw.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(raw) as Record<string, string>;
  const out: Partial<Record<string, SymbolCode>> = {};
  for (const [source, target] of Object.entries(parsed)) {
    const mapped = mapIbkrSymbol(target);
    if (!mapped) {
      continue;
    }
    out[source.trim().toUpperCase()] = mapped;
  }
  return out;
};

const normalizeContractSpec = (raw: unknown): IbkrContractSpec | null => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const symbol = typeof record.symbol === 'string' ? record.symbol.trim().toUpperCase() : '';
  const exchange = typeof record.exchange === 'string' ? record.exchange.trim().toUpperCase() : '';
  const currency = typeof record.currency === 'string' ? record.currency.trim().toUpperCase() : '';
  if (!symbol || !exchange || !currency) {
    return null;
  }

  const secTypeRaw = typeof record.secType === 'string' ? record.secType.trim().toUpperCase() : 'FUT';
  const secType = secTypeRaw === 'CONTFUT' ? 'CONTFUT' : 'FUT';

  return {
    symbol,
    exchange,
    currency,
    multiplier:
      typeof record.multiplier === 'string' && record.multiplier.trim().length > 0
        ? record.multiplier.trim()
        : undefined,
    secType,
    lastTradeDateOrContractMonth:
      typeof record.lastTradeDateOrContractMonth === 'string' &&
      record.lastTradeDateOrContractMonth.trim().length > 0
        ? record.lastTradeDateOrContractMonth.trim()
        : undefined,
    localSymbol:
      typeof record.localSymbol === 'string' && record.localSymbol.trim().length > 0
        ? record.localSymbol.trim().toUpperCase()
        : undefined,
    includeExpired: record.includeExpired === true
  };
};

export const parseIbkrContractSpecsEnv = (
  raw: string | undefined
): Partial<Record<string, IbkrContractSpec>> => {
  if (!raw || raw.trim().length === 0) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  const out: Partial<Record<string, IbkrContractSpec>> = {};

  if (Array.isArray(parsed)) {
    for (const entry of parsed) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const alias = typeof record.alias === 'string' ? record.alias.trim().toUpperCase() : '';
      const normalized = normalizeContractSpec(entry);
      if (!alias || !normalized) {
        continue;
      }
      out[alias] = normalized;
    }
    return out;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const normalized = normalizeContractSpec(value);
    if (!normalized) {
      continue;
    }
    out[key.trim().toUpperCase()] = normalized;
  }
  return out;
};

export const supportedIbkrSymbolCodes = Object.keys(defaultContractSpecs) as SymbolCode[];
