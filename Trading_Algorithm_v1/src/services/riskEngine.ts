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

const round = (value: number, decimals = 2): number => Number(value.toFixed(decimals));

type FundedAccountRecommendation = NonNullable<RiskDecision['fundedAccount']>;

const confidenceLabel = (confidenceScore: number): FundedAccountRecommendation['confidenceLabel'] => {
  if (confidenceScore >= 0.9) {
    return 'A_PLUS';
  }
  if (confidenceScore >= 0.8) {
    return 'HIGH';
  }
  if (confidenceScore >= 0.65) {
    return 'MEDIUM';
  }
  return 'LOW';
};

const buildFundedAccountRecommendation = (
  input: RiskCheckInput,
  config: RiskConfig,
  requestedRiskPct: number
): FundedAccountRecommendation => {
  const funded = config.fundedAccount;
  const score = clamp((input.candidate.finalScore ?? input.candidate.baseScore) / 100, 0, 1);
  const oneMinuteConfidence = clamp(input.candidate.oneMinuteConfidence, 0, 1);
  const confidenceScore = round(score * 0.65 + oneMinuteConfidence * 0.35, 3);
  const label = confidenceLabel(confidenceScore);
  const reasons: string[] = [];
  const accountSize = Math.max(funded.accountSize, 1);
  const accountProfitPct = ((input.account.equity - accountSize) / accountSize) * 100;
  const targetProgressPct = clamp(accountProfitPct / funded.profitTargetPct, 0, 1);
  const remainingToTargetPct = Math.max(0, funded.profitTargetPct - Math.max(0, accountProfitPct));
  const drawdownUsedPct = Math.max(0, ((accountSize - input.account.equity) / accountSize) * 100);
  const drawdownBufferPct = Math.max(0, funded.maxDrawdownPct - drawdownUsedPct);
  const dailyLossBufferPct = Math.max(0, funded.dailyLossLimitPct - input.account.dailyLossPct);
  const stopDistance = Math.abs(input.candidate.entry - input.candidate.stopLoss);
  const takeProfit = input.candidate.takeProfit[0];
  const rewardDistance =
    typeof takeProfit === 'number' && Number.isFinite(takeProfit)
      ? Math.abs(takeProfit - input.candidate.entry)
      : undefined;
  const rewardRiskRatio =
    rewardDistance !== undefined && stopDistance > 0 ? round(rewardDistance / stopDistance, 2) : undefined;

  let confidenceRiskPct = requestedRiskPct;
  if (confidenceScore < funded.confidenceFloor) {
    confidenceRiskPct = 0;
    reasons.push('Confidence is below the funded-account floor.');
  } else if (confidenceScore < 0.65) {
    confidenceRiskPct = Math.min(requestedRiskPct * 0.5, funded.maxRiskPct);
    reasons.push('Low confidence: reduce size before risking evaluation drawdown.');
  } else if (confidenceScore < 0.8) {
    confidenceRiskPct = Math.min(requestedRiskPct, funded.maxRiskPct);
    reasons.push('Medium confidence: use normal funded-account risk.');
  } else {
    confidenceRiskPct = Math.min(Math.max(requestedRiskPct * 1.2, requestedRiskPct), funded.maxRiskPct);
    reasons.push(label === 'A_PLUS' ? 'A+ confidence: eligible for top funded-account risk.' : 'High confidence: eligible for modest risk expansion.');
  }

  const safeCaps = [
    funded.maxRiskPct,
    Math.max(0, dailyLossBufferPct * funded.dailyLossBufferFraction),
    Math.max(0, drawdownBufferPct * funded.drawdownBufferFraction)
  ];
  let maxSafeRiskPct = Math.min(...safeCaps);
  if (targetProgressPct >= funded.nearTargetProgressPct) {
    maxSafeRiskPct = Math.min(maxSafeRiskPct, Math.max(funded.minRiskPct, requestedRiskPct * 0.5));
    reasons.push('Near profit target: protect the pass instead of pressing size.');
  }

  if (dailyLossBufferPct <= 0) {
    reasons.push('Daily loss buffer is exhausted.');
  }
  if (drawdownBufferPct <= 0) {
    reasons.push('Drawdown buffer is exhausted.');
  }

  const recommendedRiskPct = round(clamp(confidenceRiskPct, 0, maxSafeRiskPct), 2);
  const recommendedRiskAmount = round(input.account.equity * (recommendedRiskPct / 100), 2);
  const action: FundedAccountRecommendation['action'] =
    recommendedRiskPct <= 0 || recommendedRiskPct < funded.minRiskPct
      ? 'SKIP'
      : recommendedRiskPct < requestedRiskPct
        ? 'REDUCE'
        : 'TAKE';

  const passPlan =
    action === 'TAKE'
      ? `${label.replace('_', '+')} setup: use ${recommendedRiskPct.toFixed(2)}% risk while preserving funded-account buffers.`
      : action === 'REDUCE'
        ? `Reduce to ${recommendedRiskPct.toFixed(2)}% risk to keep daily loss and drawdown buffers intact.`
        : 'Skip or paper-track this alert; funded-account confidence or safety buffer is not good enough.';

  return {
    enabled: true,
    action,
    confidenceScore,
    confidenceLabel: label,
    recommendedRiskPct,
    recommendedRiskAmount,
    maxSafeRiskPct: round(maxSafeRiskPct, 2),
    requestedRiskPct: round(requestedRiskPct, 2),
    targetProgressPct: round(targetProgressPct, 3),
    remainingToTargetPct: round(remainingToTargetPct, 2),
    dailyLossBufferPct: round(dailyLossBufferPct, 2),
    drawdownUsedPct: round(drawdownUsedPct, 2),
    drawdownBufferPct: round(drawdownBufferPct, 2),
    ...(rewardRiskRatio !== undefined ? { rewardRiskRatio } : {}),
    passPlan,
    reasons
  };
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
  const requestedRiskPct = finalRiskPct;
  const fundedAccount = config.fundedAccount.enabled
    ? buildFundedAccountRecommendation(input, config, requestedRiskPct)
    : undefined;
  if (fundedAccount) {
    finalRiskPct = fundedAccount.recommendedRiskPct;
    if (fundedAccount.action === 'SKIP') {
      reasonCodes.push('FUNDED_ACCOUNT_RISK_REJECTED');
    } else if (fundedAccount.action === 'REDUCE') {
      reasonCodes.push('FUNDED_ACCOUNT_RISK_REDUCED');
    }
  }

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
  const takeProfit = input.candidate.takeProfit[0];
  const rewardDistance =
    typeof takeProfit === 'number' && Number.isFinite(takeProfit)
      ? Math.abs(takeProfit - input.candidate.entry)
      : undefined;
  const rewardRiskRatio =
    rewardDistance !== undefined && stopDistance > 0 ? round(rewardDistance / stopDistance, 2) : undefined;
  let positionSize = 0;
  let projectedLossAmount = 0;
  let projectedRewardAmount = 0;

  if (stopDistance <= 0) {
    blocked = true;
    reasonCodes.push('INVALID_STOP_DISTANCE');
  } else if (fundedAccount?.action === 'SKIP') {
    blocked = true;
  } else {
    const riskAmount = input.account.equity * (finalRiskPct / 100);
    projectedLossAmount = round(riskAmount, 2);
    positionSize = Number((riskAmount / stopDistance).toFixed(4));
    projectedRewardAmount =
      rewardDistance !== undefined ? round(positionSize * rewardDistance, 2) : 0;
  }

  return {
    allowed: !blocked,
    finalRiskPct,
    positionSize,
    projectedLossAmount,
    projectedRewardAmount,
    ...(rewardRiskRatio !== undefined ? { rewardRiskRatio } : {}),
    reasonCodes,
    blockedByNewsWindow,
    blockedByTradingWindow,
    blockedByPolicy: !policyConfirmed,
    checkedAt: input.now,
    ...(fundedAccount ? { fundedAccount } : {})
  };
};
