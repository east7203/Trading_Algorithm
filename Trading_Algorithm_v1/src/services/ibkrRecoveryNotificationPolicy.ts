import type { RiskConfig } from '../domain/types.js';
import { isWithinTradingWindow } from './tradingWindowService.js';

const MANUAL_RECOVERY_PREFIX = 'manual-';
const ALWAYS_NOTIFY_SOURCES = new Set(['scheduled-reminder', 'reminder-test']);

export const shouldNotifyIbkrRecovery = (
  source: string,
  nowIso: string,
  tradingWindow: RiskConfig['tradingWindow']
): boolean => {
  const normalizedSource = source.trim().toLowerCase();
  if (normalizedSource.startsWith(MANUAL_RECOVERY_PREFIX) || ALWAYS_NOTIFY_SOURCES.has(normalizedSource)) {
    return true;
  }

  return isWithinTradingWindow(nowIso, tradingWindow);
};
