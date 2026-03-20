import type { NewsEvent } from '../../domain/types.js';

export interface EconomicCalendarClientStatus {
  sourceName: string;
  mode: 'stub' | 'live';
  cachedEventCount: number;
  filteredCountryCount?: number;
  nextEventAt?: string;
  lastFetchedAt?: string;
  cacheExpiresAt?: string;
  lastError?: string;
}

export interface EconomicCalendarClient {
  sourceName: string;
  listUpcomingEvents(): Promise<NewsEvent[]>;
  status(): EconomicCalendarClientStatus;
}

export interface TradingEconomicsCalendarClientConfig {
  apiKey?: string;
  baseUrl?: string;
  countries?: string[];
  minImportance?: 1 | 2 | 3;
  lookbackHours?: number;
  lookaheadHours?: number;
  cacheTtlMs?: number;
  requestTimeoutMs?: number;
  maxEvents?: number;
}

interface TradingEconomicsCalendarItem {
  CalendarId?: string | number;
  Date?: string;
  Country?: string;
  Category?: string;
  Event?: string;
  Reference?: string;
  ReferenceDate?: string;
  Source?: string;
  SourceURL?: string;
  Actual?: string;
  Previous?: string;
  Forecast?: string;
  TEForecast?: string;
  Importance?: string | number;
  LastUpdate?: string;
  Revised?: string;
  Currency?: string;
  Unit?: string;
}

interface CalendarCacheState {
  events: NewsEvent[];
  fetchedAtMs: number;
  expiresAtMs: number;
}

const DEFAULT_SOURCE_NAME = 'tradingeconomics';
const DEFAULT_BASE_URL = 'https://api.tradingeconomics.com';
const DEFAULT_COUNTRIES = ['All'];
const COUNTRY_TO_CURRENCY: Record<string, string> = {
  Australia: 'AUD',
  Canada: 'CAD',
  China: 'CNY',
  'Euro Area': 'EUR',
  France: 'EUR',
  Germany: 'EUR',
  Italy: 'EUR',
  Japan: 'JPY',
  'New Zealand': 'NZD',
  Spain: 'EUR',
  Switzerland: 'CHF',
  'United Kingdom': 'GBP',
  'United States': 'USD'
};

const normalizeCountries = (countries?: string[]): string[] => {
  const normalized = (countries ?? DEFAULT_COUNTRIES)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (normalized.length === 0 || normalized.some((value) => value.toLowerCase() === 'all')) {
    return ['All'];
  }

  return [...new Set(normalized)];
};

const impactFromImportance = (importance: number): 'low' | 'medium' | 'high' => {
  if (importance >= 3) {
    return 'high';
  }
  if (importance >= 2) {
    return 'medium';
  }
  return 'low';
};

const parseImportance = (value: string | number | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 1;
};

const toIsoDate = (value: Date): string => value.toISOString().slice(0, 10);

const normalizeOptionalText = (value: string | undefined): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildEventWindow = (lookbackHours: number, lookaheadHours: number, nowMs: number): { startDate: string; endDate: string } => {
  const start = new Date(nowMs - lookbackHours * 60 * 60 * 1000);
  const end = new Date(nowMs + lookaheadHours * 60 * 60 * 1000);
  return {
    startDate: toIsoDate(start),
    endDate: toIsoDate(end)
  };
};

const buildTradingEconomicsUrl = (
  baseUrl: string,
  apiKey: string,
  startDate: string,
  endDate: string
): string => {
  const url = new URL(`/calendar/country/All/${startDate}/${endDate}`, baseUrl);
  url.searchParams.set('c', apiKey);
  url.searchParams.set('f', 'json');
  return url.toString();
};

const mapTradingEconomicsEvent = (sourceName: string, row: TradingEconomicsCalendarItem): NewsEvent | null => {
  if (!row.Date) {
    return null;
  }

  const startsAtMs = Date.parse(row.Date);
  if (!Number.isFinite(startsAtMs)) {
    return null;
  }

  const importanceScore = parseImportance(row.Importance);
  const country = normalizeOptionalText(row.Country);
  const currency = normalizeOptionalText(row.Currency) ?? (country ? COUNTRY_TO_CURRENCY[country] ?? '' : '');

  return {
    currency,
    impact: impactFromImportance(importanceScore),
    startsAt: new Date(startsAtMs).toISOString(),
    source: sourceName,
    country: country ?? undefined,
    title: normalizeOptionalText(row.Event) ?? undefined,
    category: normalizeOptionalText(row.Category) ?? undefined,
    officialSource: normalizeOptionalText(row.Source) ?? undefined,
    officialSourceUrl: normalizeOptionalText(row.SourceURL) ?? undefined,
    actual: normalizeOptionalText(row.Actual),
    forecast: normalizeOptionalText(row.Forecast) ?? normalizeOptionalText(row.TEForecast),
    previous: normalizeOptionalText(row.Previous),
    revised: normalizeOptionalText(row.Revised),
    reference: normalizeOptionalText(row.Reference),
    importanceScore,
    unit: normalizeOptionalText(row.Unit)
  };
};

export class InMemoryEconomicCalendarClient implements EconomicCalendarClient {
  sourceName = 'in-memory-calendar';

  constructor(private events: NewsEvent[] = []) {}

  setEvents(events: NewsEvent[]): void {
    this.events = events;
  }

  async listUpcomingEvents(): Promise<NewsEvent[]> {
    return this.events;
  }

  status(): EconomicCalendarClientStatus {
    const nextEventAt = [...this.events]
      .map((event) => event.startsAt)
      .filter((value) => Date.parse(value) >= Date.now())
      .sort()
      .at(0);

    return {
      sourceName: this.sourceName,
      mode: 'stub',
      cachedEventCount: this.events.length,
      nextEventAt
    };
  }
}

export class TradingEconomicsCalendarClient implements EconomicCalendarClient {
  sourceName = DEFAULT_SOURCE_NAME;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly countries: string[];
  private readonly minImportance: number;
  private readonly lookbackHours: number;
  private readonly lookaheadHours: number;
  private readonly cacheTtlMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maxEvents: number;
  private cache: CalendarCacheState | null = null;
  private refreshPromise: Promise<NewsEvent[]> | null = null;
  private lastError?: string;

  constructor(config: TradingEconomicsCalendarClientConfig = {}) {
    this.apiKey = (config.apiKey ?? 'guest:guest').trim();
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    this.countries = normalizeCountries(config.countries);
    this.minImportance = Math.min(3, Math.max(1, Math.trunc(config.minImportance ?? 2)));
    this.lookbackHours = Math.max(1, Math.trunc(config.lookbackHours ?? 6));
    this.lookaheadHours = Math.max(1, Math.trunc(config.lookaheadHours ?? 72));
    this.cacheTtlMs = Math.max(30_000, Math.trunc(config.cacheTtlMs ?? 180_000));
    this.requestTimeoutMs = Math.max(1_000, Math.trunc(config.requestTimeoutMs ?? 10_000));
    this.maxEvents = Math.max(1, Math.trunc(config.maxEvents ?? 120));
  }

  status(): EconomicCalendarClientStatus {
    const nextEventAt = this.cache?.events
      .map((event) => event.startsAt)
      .filter((value) => Date.parse(value) >= Date.now())
      .sort()
      .at(0);

    return {
      sourceName: this.sourceName,
      mode: 'live',
      cachedEventCount: this.cache?.events.length ?? 0,
      filteredCountryCount: this.countries[0] === 'All' ? undefined : this.countries.length,
      nextEventAt,
      lastFetchedAt: this.cache ? new Date(this.cache.fetchedAtMs).toISOString() : undefined,
      cacheExpiresAt: this.cache ? new Date(this.cache.expiresAtMs).toISOString() : undefined,
      lastError: this.lastError
    };
  }

  async listUpcomingEvents(): Promise<NewsEvent[]> {
    const nowMs = Date.now();
    if (this.cache && this.cache.expiresAtMs > nowMs) {
      return [...this.cache.events];
    }

    if (!this.refreshPromise) {
      this.refreshPromise = this.refresh(nowMs).finally(() => {
        this.refreshPromise = null;
      });
    }

    try {
      return [...(await this.refreshPromise)];
    } catch {
      return this.cache ? [...this.cache.events] : [];
    }
  }

  private async refresh(nowMs: number): Promise<NewsEvent[]> {
    const { startDate, endDate } = buildEventWindow(this.lookbackHours, this.lookaheadHours, nowMs);
    const url = buildTradingEconomicsUrl(this.baseUrl, this.apiKey, startDate, endDate);
    const signal = AbortSignal.timeout(this.requestTimeoutMs);
    const response = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        Accept: 'application/json'
      }
    });

    if (!response.ok) {
      this.lastError = `TradingEconomics request failed (${response.status})`;
      throw new Error(this.lastError);
    }

    const payload = (await response.json()) as TradingEconomicsCalendarItem[];
    const countrySet = this.countries[0] === 'All' ? null : new Set(this.countries);
    const minWindowMs = nowMs - this.lookbackHours * 60 * 60 * 1000;
    const maxWindowMs = nowMs + this.lookaheadHours * 60 * 60 * 1000;
    const events = payload
      .map((row) => mapTradingEconomicsEvent(this.sourceName, row))
      .filter((event): event is NewsEvent => Boolean(event))
      .filter((event) => {
        const eventMs = Date.parse(event.startsAt);
        if (!Number.isFinite(eventMs) || eventMs < minWindowMs || eventMs > maxWindowMs) {
          return false;
        }

        if ((event.importanceScore ?? 1) < this.minImportance) {
          return false;
        }

        return countrySet ? countrySet.has(event.country ?? '') : true;
      })
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .slice(0, this.maxEvents);

    const newestRawEventMs = payload
      .map((row) => (row.Date ? Date.parse(row.Date) : Number.NaN))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => right - left)
      .at(0);

    this.lastError =
      events.length === 0 &&
      typeof newestRawEventMs === 'number' &&
      newestRawEventMs < nowMs - 24 * 60 * 60 * 1000
        ? 'Provider returned stale calendar data; supply a dedicated API key.'
        : undefined;
    this.cache = {
      events,
      fetchedAtMs: nowMs,
      expiresAtMs: nowMs + this.cacheTtlMs
    };
    return events;
  }
}
