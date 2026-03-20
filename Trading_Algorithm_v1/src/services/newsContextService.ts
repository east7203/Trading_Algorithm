import type { NewsEvent, SymbolCode } from '../domain/types.js';

export interface EvaluatedNewsEvent {
  event: NewsEvent;
  minutesUntilEvent: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  scorePenalty: number;
  blockingReasonCode?: string;
  relevance: 'direct' | 'cross-market';
}

export interface NewsContext {
  blocked: boolean;
  blockedByWindow: boolean;
  scoreAdjustment: number;
  reasonCodes: string[];
  relevantEvents: EvaluatedNewsEvent[];
  primaryEvent?: EvaluatedNewsEvent;
  summary?: string;
}

const MS_PER_MINUTE = 60_000;
const CRITICAL_EVENT_PATTERN =
  /\b(cpi|inflation|ppi|pce|powell|fomc|fed|interest rate|rate decision|non[-\s]?farm|payrolls?|nfp|jobless|unemployment|employment|gdp|retail sales|ism|pmi|consumer confidence|central bank)\b/i;
const DIRECT_CURRENCY_BY_SYMBOL: Record<SymbolCode, string> = {
  NAS100: 'USD',
  US30: 'USD',
  NQ: 'USD',
  ES: 'USD',
  YM: 'USD',
  MNQ: 'USD',
  MYM: 'USD'
};
const CROSS_MARKET_CURRENCIES = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CNH', 'CAD', 'AUD', 'CHF', 'NZD']);
const CROSS_MARKET_COUNTRIES = new Set([
  'Australia',
  'Canada',
  'China',
  'Euro Area',
  'France',
  'Germany',
  'Italy',
  'Japan',
  'New Zealand',
  'Spain',
  'Switzerland',
  'United Kingdom',
  'United States'
]);

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const classifySeverity = (event: NewsEvent): EvaluatedNewsEvent['severity'] => {
  const searchable = [event.title, event.category, event.reference].filter(Boolean).join(' ');
  if (CRITICAL_EVENT_PATTERN.test(searchable)) {
    return 'critical';
  }
  if (event.importanceScore !== undefined) {
    if (event.importanceScore >= 3) {
      return 'high';
    }
    if (event.importanceScore >= 2) {
      return 'medium';
    }
    return 'low';
  }
  if (event.impact === 'high') {
    return 'high';
  }
  if (event.impact === 'medium') {
    return 'medium';
  }
  return 'low';
};

const classifyRelevance = (
  event: NewsEvent,
  symbol: SymbolCode
): EvaluatedNewsEvent['relevance'] | null => {
  const eventCurrency = event.currency.trim().toUpperCase();
  const directCurrency = DIRECT_CURRENCY_BY_SYMBOL[symbol];

  if (eventCurrency === directCurrency) {
    return 'direct';
  }
  if (eventCurrency.length > 0 && CROSS_MARKET_CURRENCIES.has(eventCurrency)) {
    return 'cross-market';
  }
  if (event.country && CROSS_MARKET_COUNTRIES.has(event.country)) {
    return event.country === 'United States' ? 'direct' : 'cross-market';
  }
  return null;
};

const isWithinWindow = (minutesUntilEvent: number, beforeMinutes: number, afterMinutes: number): boolean =>
  minutesUntilEvent <= beforeMinutes && minutesUntilEvent >= -afterMinutes;

const getScorePenalty = (
  severity: EvaluatedNewsEvent['severity'],
  relevance: EvaluatedNewsEvent['relevance'],
  minutesUntilEvent: number
): number => {
  if (severity === 'critical' && isWithinWindow(minutesUntilEvent, 180, 120)) {
    return 2.5;
  }
  if (severity === 'high' && relevance === 'direct' && isWithinWindow(minutesUntilEvent, 120, 90)) {
    return 2;
  }
  if (severity === 'high' && relevance === 'cross-market' && isWithinWindow(minutesUntilEvent, 90, 60)) {
    return 1.5;
  }
  if (severity === 'medium' && relevance === 'direct' && isWithinWindow(minutesUntilEvent, 60, 45)) {
    return 1;
  }
  if (severity === 'medium' && relevance === 'cross-market' && isWithinWindow(minutesUntilEvent, 45, 30)) {
    return 0.5;
  }
  if (severity === 'low' && relevance === 'direct' && isWithinWindow(minutesUntilEvent, 20, 10)) {
    return 0.25;
  }
  return 0;
};

const getBlockingReasonCode = (
  severity: EvaluatedNewsEvent['severity'],
  relevance: EvaluatedNewsEvent['relevance'],
  minutesUntilEvent: number
): string | undefined => {
  if (severity === 'critical' && isWithinWindow(minutesUntilEvent, 30, 60)) {
    return 'CRITICAL_MACRO_EVENT_WINDOW_BLOCK';
  }
  if (severity === 'high' && isWithinWindow(minutesUntilEvent, 20, 45)) {
    return relevance === 'direct'
      ? 'HIGH_IMPACT_USD_NEWS_WINDOW_BLOCK'
      : 'HIGH_IMPACT_MACRO_WINDOW_BLOCK';
  }
  if (severity === 'medium' && relevance === 'direct' && isWithinWindow(minutesUntilEvent, 10, 20)) {
    return 'MEDIUM_IMPACT_USD_NEWS_WINDOW_BLOCK';
  }
  return undefined;
};

const compareEvents = (left: EvaluatedNewsEvent, right: EvaluatedNewsEvent): number => {
  const severityOrder: Record<EvaluatedNewsEvent['severity'], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1
  };
  if (severityOrder[left.severity] !== severityOrder[right.severity]) {
    return severityOrder[right.severity] - severityOrder[left.severity];
  }
  if (left.scorePenalty !== right.scorePenalty) {
    return right.scorePenalty - left.scorePenalty;
  }
  return Math.abs(left.minutesUntilEvent) - Math.abs(right.minutesUntilEvent);
};

const summarizePrimaryEvent = (primary: EvaluatedNewsEvent | undefined): string | undefined => {
  if (!primary) {
    return undefined;
  }

  const event = primary.event;
  const label = event.title ?? event.category ?? `${event.currency || event.country || 'Macro'} event`;
  const timing =
    primary.minutesUntilEvent >= 0
      ? `in ${Math.round(primary.minutesUntilEvent)}m`
      : `${Math.round(Math.abs(primary.minutesUntilEvent))}m ago`;

  return `${label} ${timing}`;
};

export const evaluateNewsContext = (
  newsEvents: NewsEvent[],
  nowIso: string,
  symbol: SymbolCode
): NewsContext => {
  const nowMs = Date.parse(nowIso);
  const relevantEvents: EvaluatedNewsEvent[] = [];

  for (const event of newsEvents) {
    const eventTimeMs = Date.parse(event.startsAt);
    if (!Number.isFinite(eventTimeMs)) {
      continue;
    }

    const relevance = classifyRelevance(event, symbol);
    if (!relevance) {
      continue;
    }

    const minutesUntilEvent = (eventTimeMs - nowMs) / MS_PER_MINUTE;
    const severity = classifySeverity(event);
    const scorePenalty = getScorePenalty(severity, relevance, minutesUntilEvent);
    const blockingReasonCode = getBlockingReasonCode(severity, relevance, minutesUntilEvent);

    if (scorePenalty <= 0 && !blockingReasonCode) {
      continue;
    }

    relevantEvents.push({
      event,
      minutesUntilEvent,
      severity,
      scorePenalty,
      blockingReasonCode,
      relevance
    });
  }

  relevantEvents.sort(compareEvents);

  const primaryEvent = relevantEvents[0];
  const reasonCodes = [...new Set(relevantEvents.map((event) => event.blockingReasonCode).filter(Boolean))] as string[];
  const scorePenalty = clamp(relevantEvents.reduce((sum, event) => sum + event.scorePenalty, 0), 0, 4);

  return {
    blocked: reasonCodes.length > 0,
    blockedByWindow: reasonCodes.length > 0,
    scoreAdjustment: -scorePenalty,
    reasonCodes,
    relevantEvents,
    primaryEvent,
    summary: summarizePrimaryEvent(primaryEvent)
  };
};
