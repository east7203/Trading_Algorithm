import { v4 as uuidv4 } from 'uuid';
import type { ExecutionIntent, RiskDecision, RiskConfig, SetupCandidate } from '../domain/types.js';
import { JournalStore } from '../stores/journalStore.js';
import type { TradeLockerClient } from '../integrations/tradelocker/TradeLockerClient.js';

export class ExecutionService {
  constructor(
    private readonly journal: JournalStore,
    // Retained for backward compatibility/injection contracts.
    // E8 Futures mode is manual-only and does not place API orders.
    private readonly _tradeLockerClient: TradeLockerClient,
    private readonly getRiskConfig: () => RiskConfig
  ) {}

  private validateChecklist(manualChecklistConfirmed: boolean, paperAccountConfirmed: boolean): void {
    if (!manualChecklistConfirmed) {
      throw new Error('Manual execution checklist confirmation is required');
    }
    if (!paperAccountConfirmed) {
      throw new Error('Paper account confirmation is required');
    }
  }

  propose(candidate: SetupCandidate, riskDecision: RiskDecision, now: string): ExecutionIntent {
    if (!riskDecision.allowed) {
      throw new Error(`Cannot propose execution: risk check blocked (${riskDecision.reasonCodes.join(', ')})`);
    }

    const config = this.getRiskConfig();
    if (riskDecision.finalRiskPct > config.hardPerTradeRiskPctCap) {
      throw new Error('Cannot propose execution: risk exceeds hard cap');
    }

    if (riskDecision.positionSize <= 0) {
      throw new Error('Cannot propose execution: invalid position size');
    }

    const intent: ExecutionIntent = {
      intentId: uuidv4(),
      candidateId: candidate.id,
      setupType: candidate.setupType,
      symbol: candidate.symbol,
      side: candidate.side,
      entry: candidate.entry,
      stopLoss: candidate.stopLoss,
      takeProfit: candidate.takeProfit,
      quantity: riskDecision.positionSize,
      riskPct: riskDecision.finalRiskPct,
      status: 'PROPOSED',
      requiresManualApproval: true,
      idempotencyKey: uuidv4(),
      createdAt: now
    };

    this.journal.upsertIntent(intent);
    this.journal.addEvent({
      type: 'EXECUTION_PROPOSED',
      timestamp: now,
      intentId: intent.intentId,
      candidateId: candidate.id,
      symbol: candidate.symbol,
      payload: {
        quantity: intent.quantity,
        riskPct: intent.riskPct
      }
    });

    this.journal.addOrUpdateTrade({
      intentId: intent.intentId,
      candidateId: candidate.id,
      setupType: candidate.setupType,
      symbol: candidate.symbol,
      side: candidate.side,
      riskPct: intent.riskPct,
      status: intent.status,
      createdAt: intent.createdAt
    });

    return intent;
  }

  async approve(
    intentId: string,
    approvedBy: string,
    now: string,
    manualChecklistConfirmed: boolean,
    paperAccountConfirmed: boolean
  ): Promise<ExecutionIntent> {
    const intent = this.journal.getIntent(intentId);
    if (!intent) {
      throw new Error(`Execution intent not found: ${intentId}`);
    }

    if (intent.status === 'APPROVED' || intent.status === 'SENT') {
      return intent;
    }

    if (intent.status !== 'PROPOSED') {
      throw new Error(`Execution intent cannot be approved from status ${intent.status}`);
    }

    this.validateChecklist(manualChecklistConfirmed, paperAccountConfirmed);

    const config = this.getRiskConfig();
    const policyConfirmed =
      config.policyConfirmation.firmUsageApproved && config.policyConfirmation.platformUsageApproved;

    if (!policyConfirmed) {
      const rejected: ExecutionIntent = {
        ...intent,
        status: 'REJECTED'
      };
      this.journal.upsertIntent(rejected);
      this.journal.addEvent({
        type: 'ORDER_REJECTED',
        timestamp: now,
        intentId,
        symbol: intent.symbol,
        payload: {
          reason: 'POLICY_CONFIRMATION_REQUIRED'
        }
      });
      this.journal.addOrUpdateTrade({
        intentId: rejected.intentId,
        candidateId: rejected.candidateId,
        setupType: rejected.setupType,
        symbol: rejected.symbol,
        side: rejected.side,
        riskPct: rejected.riskPct,
        status: rejected.status,
        createdAt: rejected.createdAt,
        approvedAt: now
      });
      throw new Error('Policy confirmation is required before live order placement');
    }

    this.journal.addEvent({
      type: 'EXECUTION_APPROVED',
      timestamp: now,
      intentId,
      symbol: intent.symbol,
      payload: {
        approvedBy,
        mode: 'MANUAL_ONLY',
        action: 'EXECUTE_EXTERNALLY_IN_TRADOVATE',
        manualChecklistConfirmed,
        paperAccountConfirmed
      }
    });

    const approved: ExecutionIntent = {
      ...intent,
      status: 'APPROVED',
      approvedAt: now,
      approvedBy
    };

    this.journal.upsertIntent(approved);

    this.journal.addOrUpdateTrade({
      intentId: approved.intentId,
      candidateId: approved.candidateId,
      setupType: approved.setupType,
      symbol: approved.symbol,
      side: approved.side,
      riskPct: approved.riskPct,
      status: approved.status,
      createdAt: approved.createdAt,
      approvedAt: approved.approvedAt
    });

    return approved;
  }
}
