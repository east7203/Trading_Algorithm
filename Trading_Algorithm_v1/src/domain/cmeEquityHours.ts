export type CmeEquitySessionState = 'OPEN' | 'DAILY_BREAK' | 'WEEKEND_CLOSED' | 'HOLIDAY_CLOSED';

const CME_TIMEZONE = 'America/Chicago';
const FULL_DAY_EQUITY_HOLIDAYS_2026 = new Set([
  // Good Friday, Friday April 3, 2026.
  '2026-04-03'
]);

type ClockParts = {
  weekday: string;
  hour: number;
  minute: number;
  dayKey: string;
};

const getClockParts = (value: Date | string, timeZone = CME_TIMEZONE): ClockParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(typeof value === 'string' ? new Date(value) : value);
  const find = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '00';

  return {
    weekday: parts.find((part) => part.type === 'weekday')?.value ?? 'Mon',
    hour: Number(find('hour')),
    minute: Number(find('minute')),
    dayKey: `${find('year')}-${find('month')}-${find('day')}`
  };
};

export const getCmeEquitySessionState = (value: Date | string): CmeEquitySessionState => {
  const { weekday, hour, minute, dayKey } = getClockParts(value);
  if (FULL_DAY_EQUITY_HOLIDAYS_2026.has(dayKey)) {
    return 'HOLIDAY_CLOSED';
  }

  const minuteOfDay = hour * 60 + minute;
  const dailyClose = 16 * 60;
  const dailyReopen = 17 * 60;

  switch (weekday) {
    case 'Sun':
      return minuteOfDay >= dailyReopen ? 'OPEN' : 'WEEKEND_CLOSED';
    case 'Mon':
    case 'Tue':
    case 'Wed':
    case 'Thu':
      if (minuteOfDay < dailyClose) {
        return 'OPEN';
      }
      if (minuteOfDay < dailyReopen) {
        return 'DAILY_BREAK';
      }
      return 'OPEN';
    case 'Fri':
      return minuteOfDay < dailyClose ? 'OPEN' : 'WEEKEND_CLOSED';
    default:
      return 'WEEKEND_CLOSED';
  }
};

export const isCmeEquitySessionOpen = (value: Date | string): boolean => getCmeEquitySessionState(value) === 'OPEN';
