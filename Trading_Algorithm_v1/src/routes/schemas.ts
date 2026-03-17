import { z } from 'zod';

export const symbolSchema = z.enum(['NAS100', 'US30', 'NQ', 'ES', 'YM', 'MNQ', 'MYM']);
export const sessionSchema = z.enum(['NY']);
export const sideSchema = z.enum(['LONG', 'SHORT']);

export const setupTypeSchema = z.enum([
  'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION',
  'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
  'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
  'NY_BREAK_RETEST_MOMENTUM'
]);

export const candleSchema = z.object({
  timestamp: z.string().datetime(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional()
});

export const oneMinuteBarSchema = z.object({
  timestamp: z.string().datetime(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
  symbol: symbolSchema
});

export const setupCandidateSchema = z.object({
  id: z.string(),
  setupType: setupTypeSchema,
  symbol: symbolSchema,
  session: sessionSchema,
  detectionTimeframe: z.literal('15m'),
  executionTimeframe: z.literal('5m'),
  side: sideSchema,
  entry: z.number(),
  stopLoss: z.number(),
  takeProfit: z.array(z.number()).min(1),
  baseScore: z.number(),
  oneMinuteConfidence: z.number(),
  finalScore: z.number().optional(),
  eligibility: z.object({
    passed: z.boolean(),
    passReasons: z.array(z.string()),
    failReasons: z.array(z.string())
  }),
  metadata: z.record(z.unknown()),
  generatedAt: z.string().datetime()
});

export const riskDecisionSchema = z.object({
  allowed: z.boolean(),
  finalRiskPct: z.number(),
  positionSize: z.number(),
  reasonCodes: z.array(z.string()),
  blockedByNewsWindow: z.boolean(),
  blockedByTradingWindow: z.boolean(),
  blockedByPolicy: z.boolean(),
  checkedAt: z.string().datetime()
});

export const signalGenerateBodySchema = z.object({
  symbol: symbolSchema,
  session: sessionSchema,
  now: z.string().datetime(),
  timeframeData: z.object({
    '15m': z.array(candleSchema),
    '5m': z.array(candleSchema),
    '1m': z.array(candleSchema),
    '1H': z.array(candleSchema).optional(),
    '4H': z.array(candleSchema).optional(),
    D1: z.array(candleSchema).optional(),
    W1: z.array(candleSchema).optional()
  }),
  sessionLevels: z.object({
    high: z.number(),
    low: z.number(),
    nyRangeHigh: z.number(),
    nyRangeLow: z.number()
  })
});

export const signalRankBodySchema = z.object({
  candidates: z.array(setupCandidateSchema)
});

export const riskCheckBodySchema = z.object({
  candidate: setupCandidateSchema,
  account: z.object({
    equity: z.number().positive(),
    dailyLossPct: z.number().nonnegative(),
    sessionLossPct: z.number().nonnegative(),
    consecutiveLosses: z.number().int().nonnegative()
  }),
  market: z.object({
    spreadPoints: z.number().nonnegative(),
    expectedSlippagePoints: z.number().nonnegative()
  }),
  requestedRiskPct: z.number().positive().optional(),
  now: z.string().datetime(),
  newsEvents: z
    .array(
      z.object({
        currency: z.string(),
        impact: z.enum(['low', 'medium', 'high']),
        startsAt: z.string().datetime(),
        source: z.string()
      })
    )
    .optional()
});

export const riskConfigPatchSchema = z
  .object({
    perTradeRiskPctDefault: z.number().positive().optional(),
    perTradeRiskPctMax: z.number().positive().optional(),
    dailyLossCapPct: z.number().positive().optional(),
    sessionLossCapPct: z.number().positive().optional(),
    maxConsecutiveLosses: z.number().int().positive().optional(),
    maxSpreadPoints: z.number().positive().optional(),
    maxSlippagePoints: z.number().positive().optional(),
    killSwitchEnabled: z.boolean().optional(),
    tradingWindow: z
      .object({
        enabled: z.boolean().optional(),
        timezone: z.string().min(1).optional(),
        startHour: z.number().int().min(0).max(23).optional(),
        startMinute: z.number().int().min(0).max(59).optional(),
        endHour: z.number().int().min(0).max(23).optional(),
        endMinute: z.number().int().min(0).max(59).optional()
      })
      .optional(),
    policyConfirmation: z
      .object({
        firmUsageApproved: z.boolean().optional(),
        platformUsageApproved: z.boolean().optional(),
        confirmedBy: z.string().min(1).optional(),
        confirmedAt: z.string().datetime().optional()
      })
      .optional()
  })
  .refine((val) => Object.keys(val).length > 0, {
    message: 'At least one field must be provided'
  });

export const executionProposeBodySchema = z.object({
  candidate: setupCandidateSchema,
  riskDecision: riskDecisionSchema,
  now: z.string().datetime()
});

export const executionApproveBodySchema = z.object({
  intentId: z.string().uuid(),
  approvedBy: z.string().min(1),
  manualChecklistConfirmed: z.literal(true),
  paperAccountConfirmed: z.literal(true),
  now: z.string().datetime()
});

export const trainingIngestBarsBodySchema = z.object({
  bars: z.array(oneMinuteBarSchema).min(1)
});

export const webPushSubscriptionPayloadSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

export const webPushSubscribeBodySchema = z.object({
  subscription: webPushSubscriptionPayloadSchema,
  deviceLabel: z.string().min(1).max(120).optional(),
  platform: z.string().min(1).max(120).optional()
});

export const webPushUnsubscribeBodySchema = z.object({
  endpoint: z.string().url()
});

export const nativePushRegisterBodySchema = z.object({
  deviceToken: z.string().min(16),
  platform: z.enum(['ios', 'macos']),
  deviceLabel: z.string().min(1).max(120).optional()
});

export const nativePushUnregisterBodySchema = z.object({
  deviceToken: z.string().min(16)
});

export const signalMonitorSettingsPatchSchema = z
  .object({
    timezone: z.string().min(1).optional(),
    sessionStartHour: z.number().int().min(0).max(23).optional(),
    sessionStartMinute: z.number().int().min(0).max(59).optional(),
    sessionEndHour: z.number().int().min(0).max(23).optional(),
    sessionEndMinute: z.number().int().min(0).max(59).optional(),
    nyRangeMinutes: z.number().int().min(15).max(180).optional(),
    minFinalScore: z.number().min(0).max(100).optional(),
    enabledSymbols: z.array(symbolSchema).min(1).optional(),
    enabledSetups: z.array(setupTypeSchema).min(1).optional(),
    requireOpeningRangeComplete: z.boolean().optional(),
    aPlusOnlyAfterFirstHour: z.boolean().optional(),
    aPlusMinScore: z.number().min(0).max(100).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one signal monitor setting must be provided'
  });

export const signalReviewStatusSchema = z.enum(['PENDING', 'COMPLETED']);
export const signalReviewValiditySchema = z.enum(['VALID', 'INVALID', 'UNSURE']);
export const signalReviewOutcomeSchema = z.enum(['WOULD_WIN', 'WOULD_LOSE', 'MISSED', 'SKIPPED', 'BREAKEVEN']);

export const signalReviewUpsertBodySchema = z
  .object({
    alertId: z.string().min(1),
    validity: signalReviewValiditySchema.optional(),
    outcome: signalReviewOutcomeSchema.optional(),
    notes: z.string().max(2_000).optional(),
    reviewedBy: z.string().max(120).optional(),
    reviewStatus: signalReviewStatusSchema.optional(),
    reviewedAt: z.string().datetime().optional()
  })
  .refine(
    (value) =>
      value.validity !== undefined ||
      value.outcome !== undefined ||
      value.notes !== undefined ||
      value.reviewedBy !== undefined ||
      value.reviewStatus !== undefined,
    {
      message: 'At least one review field must be provided'
    }
  );

export const signalAlertAcknowledgeBodySchema = z.object({
  acknowledgedBy: z.string().max(120).optional(),
  acknowledgedAt: z.string().datetime().optional()
});
