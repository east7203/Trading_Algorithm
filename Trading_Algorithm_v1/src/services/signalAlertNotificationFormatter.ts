import type { SignalAlert } from '../domain/types.js';

export const signalAlertSourceLabel = (alert: SignalAlert): string => {
  switch (alert.source) {
    case 'MANUAL_ENGINE':
      return 'Manual engine';
    case 'MANUAL_TEST':
      return 'Manual engine test';
    case 'PAPER_AUTONOMY':
      return 'Paper autonomy';
    default:
      return 'Signal engine';
  }
};

export const buildTradeLevelSummary = (alert: SignalAlert): string[] => {
  const entry = alert.candidate.entry;
  const stop = alert.candidate.stopLoss;
  const takeProfit = alert.candidate.takeProfit?.[0];
  const risk = Math.abs(entry - stop);
  const reward = typeof takeProfit === 'number' ? Math.abs(takeProfit - entry) : null;
  const rr =
    typeof reward === 'number' && Number.isFinite(reward) && risk > 0
      ? (reward / risk).toFixed(2)
      : null;

  return [
    Number.isFinite(entry) ? `Entry ${entry.toFixed(2)}` : null,
    Number.isFinite(stop) ? `Stop ${stop.toFixed(2)}` : null,
    typeof takeProfit === 'number' && Number.isFinite(takeProfit) ? `TP ${takeProfit.toFixed(2)}` : null,
    rr ? `RR ${rr}` : null
  ].filter((value): value is string => Boolean(value));
};

export const buildTradeLevelLines = (alert: SignalAlert): string[] => {
  const entry = alert.candidate.entry;
  const stop = alert.candidate.stopLoss;
  const takeProfit = alert.candidate.takeProfit?.[0];
  const risk = Math.abs(entry - stop);
  const reward = typeof takeProfit === 'number' ? Math.abs(takeProfit - entry) : null;
  const rr =
    typeof reward === 'number' && Number.isFinite(reward) && risk > 0
      ? (reward / risk).toFixed(2)
      : null;

  return [
    Number.isFinite(entry) ? `Entry: ${entry.toFixed(2)}` : null,
    Number.isFinite(stop) ? `Stop: ${stop.toFixed(2)}` : null,
    typeof takeProfit === 'number' && Number.isFinite(takeProfit) ? `Take Profit: ${takeProfit.toFixed(2)}` : null,
    rr ? `Risk / Reward: ${rr}R` : null
  ].filter((value): value is string => Boolean(value));
};

export const buildReminderStatusText = (
  delivery: { reason?: 'initial' | 'reminder'; reminderCount?: number } = {}
): string | null =>
  delivery.reason === 'reminder' && (delivery.reminderCount ?? 0) > 0
    ? 'Still unacknowledged'
    : null;
