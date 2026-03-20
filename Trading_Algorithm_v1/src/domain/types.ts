export type SymbolCode = 'NAS100' | 'US30' | 'NQ' | 'ES' | 'YM' | 'MNQ' | 'MYM';

export type SessionName = 'NY';

export type Timeframe = '1m' | '5m' | '15m' | '1H' | '4H' | 'D1' | 'W1';

export type Side = 'LONG' | 'SHORT';

export type SetupType =
  | 'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION'
  | 'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES'
  | 'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION'
  | 'NY_BREAK_RETEST_MOMENTUM';

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandidateEligibility {
  passed: boolean;
  passReasons: string[];
  failReasons: string[];
}

export interface SetupCandidate {
  id: string;
  setupType: SetupType;
  symbol: SymbolCode;
  session: SessionName;
  detectionTimeframe: '15m';
  executionTimeframe: '5m';
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number[];
  baseScore: number;
  oneMinuteConfidence: number;
  finalScore?: number;
  eligibility: CandidateEligibility;
  metadata: Record<string, unknown>;
  generatedAt: string;
}

export interface SignalChartSnapshot {
  timeframe: '5m';
  bars: Candle[];
  levels: {
    entry: number;
    stopLoss: number;
    takeProfit: number;
    sessionHigh?: number;
    sessionLow?: number;
    nyRangeHigh?: number;
    nyRangeLow?: number;
  };
}

export interface SignalMonitorSettings {
  timezone: string;
  sessionStartHour: number;
  sessionStartMinute: number;
  sessionEndHour: number;
  sessionEndMinute: number;
  nyRangeMinutes: number;
  minFinalScore: number;
  enabledSymbols: SymbolCode[];
  enabledSetups: SetupType[];
  requireOpeningRangeComplete: boolean;
  aPlusOnlyAfterFirstHour: boolean;
  aPlusMinScore: number;
}

export interface RiskConfig {
  perTradeRiskPctDefault: number;
  perTradeRiskPctMax: number;
  hardPerTradeRiskPctCap: 1;
  dailyLossCapPct: number;
  sessionLossCapPct: number;
  maxConsecutiveLosses: number;
  maxSpreadPoints: number;
  maxSlippagePoints: number;
  killSwitchEnabled: boolean;
  tradingWindow: {
    enabled: boolean;
    timezone: string;
    startHour: number;
    startMinute: number;
    endHour: number;
    endMinute: number;
  };
  policyConfirmation: {
    firmUsageApproved: boolean;
    platformUsageApproved: boolean;
    confirmedBy?: string;
    confirmedAt?: string;
  };
}

export interface AccountSnapshot {
  equity: number;
  dailyLossPct: number;
  sessionLossPct: number;
  consecutiveLosses: number;
}

export interface MarketConditions {
  spreadPoints: number;
  expectedSlippagePoints: number;
}

export interface NewsEvent {
  currency: string;
  impact: 'low' | 'medium' | 'high';
  startsAt: string;
  source: string;
  country?: string;
  title?: string;
  category?: string;
  officialSource?: string;
  officialSourceUrl?: string;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  revised?: string | null;
  reference?: string | null;
  importanceScore?: number;
  unit?: string | null;
}

export interface RiskCheckInput {
  candidate: SetupCandidate;
  account: AccountSnapshot;
  market: MarketConditions;
  requestedRiskPct?: number;
  now: string;
  newsEvents: NewsEvent[];
}

export interface RiskDecision {
  allowed: boolean;
  finalRiskPct: number;
  positionSize: number;
  reasonCodes: string[];
  blockedByNewsWindow: boolean;
  blockedByTradingWindow: boolean;
  blockedByPolicy: boolean;
  checkedAt: string;
}

export interface ExecutionIntent {
  intentId: string;
  candidateId: string;
  setupType: SetupType;
  symbol: SymbolCode;
  side: Side;
  entry: number;
  stopLoss: number;
  takeProfit: number[];
  quantity: number;
  riskPct: number;
  status: 'PROPOSED' | 'APPROVED' | 'SENT' | 'REJECTED';
  requiresManualApproval: true;
  idempotencyKey: string;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  orderId?: string;
}

export interface OrderEvent {
  eventId: string;
  type:
    | 'SIGNAL_GENERATED'
    | 'SIGNAL_RANKED'
    | 'SIGNAL_ALERTED'
    | 'SIGNAL_AUTO_LABELED'
    | 'SIGNAL_REVIEWED'
    | 'MODEL_PROMOTED'
    | 'MODEL_RETAINED'
    | 'RISK_CHECKED'
    | 'EXECUTION_PROPOSED'
    | 'EXECUTION_APPROVED'
    | 'ORDER_SENT'
    | 'ORDER_REJECTED';
  timestamp: string;
  intentId?: string;
  candidateId?: string;
  symbol?: SymbolCode;
  payload: Record<string, unknown>;
}

export interface TradeJournalEntry {
  intentId: string;
  candidateId: string;
  setupType: SetupType;
  symbol: SymbolCode;
  side: Side;
  riskPct: number;
  status: ExecutionIntent['status'];
  createdAt: string;
  approvedAt?: string;
  orderId?: string;
}

export interface SignalGenerationInput {
  symbol: SymbolCode;
  session: SessionName;
  now: string;
  timeframeData: {
    '15m': Candle[];
    '5m': Candle[];
    '1m': Candle[];
    '1H'?: Candle[];
    '4H'?: Candle[];
    D1?: Candle[];
    W1?: Candle[];
  };
  sessionLevels: {
    high: number;
    low: number;
    nyRangeHigh: number;
    nyRangeLow: number;
  };
}

export interface RankInput {
  candidates: SetupCandidate[];
}

export interface SignalAlert {
  alertId: string;
  symbol: SymbolCode;
  setupType: SetupType;
  side: Side;
  detectedAt: string;
  rankingModelId: string;
  executionIntentId?: string;
  title: string;
  summary: string;
  candidate: SetupCandidate;
  riskDecision: RiskDecision;
  chartSnapshot?: SignalChartSnapshot;
  reviewState?: SignalAlertReviewState;
}

export interface SignalAlertReviewState {
  reviewStatus: SignalReviewStatus;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  escalationCount: number;
  lastEscalatedAt?: string;
  reviewedAt?: string;
  validity?: SignalReviewValidity;
  outcome?: SignalReviewOutcome;
  autoOutcome?: SignalReviewOutcome;
  autoLabeledAt?: string;
  autoLabeledBy?: string;
  effectiveOutcome?: SignalReviewOutcome;
  effectiveOutcomeSource?: SignalReviewOutcomeSource;
}

export type SignalReviewStatus = 'PENDING' | 'COMPLETED';
export type SignalReviewValidity = 'VALID' | 'INVALID' | 'UNSURE';
export type SignalReviewOutcome = 'WOULD_WIN' | 'WOULD_LOSE' | 'MISSED' | 'SKIPPED' | 'BREAKEVEN';
export type SignalReviewOutcomeSource = 'MANUAL' | 'AUTO' | 'NONE';

export interface SignalReviewEntry {
  reviewId: string;
  alertId: string;
  candidateId: string;
  symbol: SymbolCode;
  setupType: SetupType;
  side: Side;
  detectedAt: string;
  reviewStatus: SignalReviewStatus;
  validity?: SignalReviewValidity;
  outcome?: SignalReviewOutcome;
  notes?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  escalationCount: number;
  lastEscalatedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  autoOutcome?: SignalReviewOutcome;
  autoLabeledAt?: string;
  autoLabeledBy?: string;
  effectiveOutcome?: SignalReviewOutcome;
  effectiveOutcomeSource?: SignalReviewOutcomeSource;
  createdAt: string;
  updatedAt: string;
  alertSnapshot: SignalAlert;
}
