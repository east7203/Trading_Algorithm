import type { RiskConfig } from '../domain/types.js';

const toMinutes = (hour: number, minute: number): number => hour * 60 + minute;

const getZonedHourMinute = (isoTimestamp: string, timeZone: string): { hour: number; minute: number } => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(new Date(isoTimestamp));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error('Unable to resolve local time for trading window check');
  }

  return { hour, minute };
};

export const isWithinTradingWindow = (
  nowIso: string,
  window: RiskConfig['tradingWindow']
): boolean => {
  if (!window.enabled) {
    return true;
  }

  const { hour, minute } = getZonedHourMinute(nowIso, window.timezone);
  const nowMinutes = toMinutes(hour, minute);
  const startMinutes = toMinutes(window.startHour, window.startMinute);
  const endMinutes = toMinutes(window.endHour, window.endMinute);

  if (startMinutes <= endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  }

  // Supports overnight ranges if needed in future configuration.
  return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
};
