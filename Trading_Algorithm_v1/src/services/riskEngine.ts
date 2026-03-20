import type { RiskCheckInput, RiskConfig, RiskDecision } from '../domain/types.js';
import { evaluateNewsContext } from './newsContextService.js';
import { isWithinTradingWindow } from './tradingWindowService.js';

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

export const evaluateRisk = (input: RiskCheckInput, config: RiskConfig): RiskDecision => {
  const reasonCodes: string[] = [];

  let finalRiskPct = input.requestedRiskPct ?? config.perTradeRiskPctDefault;

  if (finalRiskPct > config.perTradeRiskPctMax) {
    finalRiskPct = config.perTradeRiskPctMax;
    reasonCodes.push('RISK_CLAMPED_TO_USER_MAX');
  }

  if (finalRiskPct > config.hardPerTradeRiskPctCap) {
    finalRiskPct = config.hardPerTradeRiskPctCap;
    reasonCodes.push('RISK_CLAMPED_TO_HARD_CAP');
  }

  finalRiskPct = clamp(finalRiskPct, 0.01, config.hardPerTradeRiskPctCap);

  let blocked = false;

  if (config.killSwitchEnabled) {
    blocked = true;
    reasonCodes.push('KILL_SWITCH_ACTIVE');
  }

  const policyConfirmed =
    config.policyConfirmation.firmUsageApproved && config.policyConfirmation.platformUsageApproved;
  if (!policyConfirmed) {
    blocked = true;
    reasonCodes.push('POLICY_CONFIRMATION_REQUIRED');
  }

  const newsContext = evaluateNewsContext(input.newsEvents, input.now, input.candidate.symbol);
  const blockedByNewsWindow = newsContext.blocked;
  if (blockedByNewsWindow) {
    blocked = true;
    for (const code of newsContext.reasonCodes) {
      if (!reasonCodes.includes(code)) {
        reasonCodes.push(code);
      }
    }
  }

  const blockedByTradingWindow = !isWithinTradingWindow(input.now, config.tradingWindow);
  if (blockedByTradingWindow) {
    blocked = true;
    reasonCodes.push('OUTSIDE_ALLOWED_TRADING_WINDOW');
  }

  if (input.account.dailyLossPct >= config.dailyLossCapPct) {
    blocked = true;
    reasonCodes.push('DAILY_LOSS_CAP_REACHED');
  }

  if (input.account.sessionLossPct >= config.sessionLossCapPct) {
    blocked = true;
    reasonCodes.push('SESSION_LOSS_CAP_REACHED');
  }

  if (input.account.consecutiveLosses >= config.maxConsecutiveLosses) {
    blocked = true;
    reasonCodes.push('MAX_CONSECUTIVE_LOSSES_REACHED');
  }

  if (input.market.spreadPoints > config.maxSpreadPoints) {
    blocked = true;
    reasonCodes.push('SPREAD_GUARD_TRIGGERED');
  }

  if (input.market.expectedSlippagePoints > config.maxSlippagePoints) {
    blocked = true;
    reasonCodes.push('SLIPPAGE_GUARD_TRIGGERED');
  }

  const stopDistance = Math.abs(input.candidate.entry - input.candidate.stopLoss);
  let positionSize = 0;

  if (stopDistance <= 0) {
    blocked = true;
    reasonCodes.push('INVALID_STOP_DISTANCE');
  } else {
    const riskAmount = input.account.equity * (finalRiskPct / 100);
    positionSize = Number((riskAmount / stopDistance).toFixed(4));
  }

  return {
    allowed: !blocked,
    finalRiskPct,
    positionSize,
    reasonCodes,
    blockedByNewsWindow,
    blockedByTradingWindow,
    blockedByPolicy: !policyConfirmed,
    checkedAt: input.now
  };
};
