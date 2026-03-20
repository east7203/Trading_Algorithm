import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ForexFactoryCalendarClient,
  TradingEconomicsCalendarClient
} from '../../src/integrations/news/EconomicCalendarClient.js';

describe('TradingEconomicsCalendarClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('maps and caches calendar events from TradingEconomics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T14:00:00.000Z'));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          Date: '2026-03-20T13:30:00',
          Country: 'United States',
          Category: 'Non Farm Payrolls',
          Event: 'Non Farm Payrolls',
          Actual: '220K',
          Previous: '198K',
          Forecast: '210K',
          Importance: 3,
          Source: 'U.S. Bureau of Labor Statistics',
          SourceURL: 'https://www.bls.gov/'
        },
        {
          Date: '2026-03-20T15:00:00',
          Country: 'Japan',
          Category: 'CPI',
          Event: 'Inflation Rate YoY',
          Importance: 2,
          Source: 'Cabinet Office, Japan'
        },
        {
          Date: '2026-03-20T16:00:00',
          Country: 'Brazil',
          Category: 'Retail Sales',
          Event: 'Retail Sales MoM',
          Importance: 1
        }
      ]
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new TradingEconomicsCalendarClient({
      apiKey: 'guest:guest',
      countries: ['All'],
      minImportance: 2,
      lookbackHours: 2,
      lookaheadHours: 12,
      cacheTtlMs: 60_000,
      maxEvents: 20
    });

    const first = await client.listUpcomingEvents();
    const second = await client.listUpcomingEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0]).toMatchObject({
      currency: 'USD',
      impact: 'high',
      country: 'United States',
      title: 'Non Farm Payrolls',
      category: 'Non Farm Payrolls',
      actual: '220K',
      forecast: '210K',
      previous: '198K',
      importanceScore: 3
    });
    expect(first[1]).toMatchObject({
      currency: 'JPY',
      impact: 'medium',
      country: 'Japan',
      title: 'Inflation Rate YoY',
      category: 'CPI',
      importanceScore: 2
    });
    expect(client.status()).toMatchObject({
      sourceName: 'tradingeconomics',
      mode: 'live',
      cachedEventCount: 2
    });
  });
});

describe('ForexFactoryCalendarClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('maps and caches calendar events from Forex Factory weekly export', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T14:00:00.000Z'));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          title: 'Core Retail Sales m/m',
          country: 'USD',
          date: '2026-03-20T09:00:00-04:00',
          impact: 'High',
          forecast: '0.3%',
          previous: '0.2%',
          actual: '0.4%'
        },
        {
          title: 'German ZEW Economic Sentiment',
          country: 'EUR',
          date: '2026-03-21T06:00:00-04:00',
          impact: 'Low',
          forecast: '39.0',
          previous: '58.3%'
        }
      ]
    });

    vi.stubGlobal('fetch', fetchMock);

    const client = new ForexFactoryCalendarClient({
      exportUrl: 'https://nfs.faireconomy.media/ff_calendar_thisweek.json?version=test',
      lookbackHours: 2,
      lookaheadHours: 48,
      cacheTtlMs: 60_000,
      maxEvents: 20
    });

    const first = await client.listUpcomingEvents();
    const second = await client.listUpcomingEvents();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(first[0]).toMatchObject({
      currency: 'USD',
      impact: 'high',
      title: 'Core Retail Sales m/m',
      category: 'Core Retail Sales m/m',
      actual: '0.4%',
      forecast: '0.3%',
      previous: '0.2%',
      importanceScore: 3
    });
    expect(client.status()).toMatchObject({
      sourceName: 'forexfactory',
      mode: 'live',
      cachedEventCount: 2
    });
  });
});
