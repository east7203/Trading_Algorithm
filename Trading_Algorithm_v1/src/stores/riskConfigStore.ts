import type { RiskConfig } from '../domain/types.js';

export const defaultRiskConfig = (): RiskConfig => ({
  perTradeRiskPctDefault: 0.5,
  perTradeRiskPctMax: 1.0,
  hardPerTradeRiskPctCap: 1,
  dailyLossCapPct: 2,
  sessionLossCapPct: 1.5,
  maxConsecutiveLosses: 3,
  maxSpreadPoints: 2.5,
  maxSlippagePoints: 1.5,
  killSwitchEnabled: false,
  tradingWindow: {
    enabled: true,
    timezone: 'America/Chicago',
    startHour: 7,
    startMinute: 0,
    endHour: 13,
    endMinute: 0
  },
  policyConfirmation: {
    firmUsageApproved: false,
    platformUsageApproved: false
  },
  fundedAccount: {
    enabled: true,
    accountSize: 100_000,
    profitTargetPct: 6,
    maxDrawdownPct: 3,
    drawdownMode: 'EOD_TRAILING',
    dailyLossLimitPct: 2,
    minRiskPct: 0.1,
    maxRiskPct: 0.75,
    confidenceFloor: 0.55,
    dailyLossBufferFraction: 0.35,
    drawdownBufferFraction: 0.25,
    nearTargetProgressPct: 0.85
  }
});

export type RiskConfigPatch = Partial<
  Omit<RiskConfig, 'hardPerTradeRiskPctCap' | 'policyConfirmation' | 'tradingWindow' | 'fundedAccount'>
> & {
  policyConfirmation?: Partial<RiskConfig['policyConfirmation']>;
  tradingWindow?: Partial<RiskConfig['tradingWindow']>;
  fundedAccount?: Partial<RiskConfig['fundedAccount']>;
};

export class RiskConfigStore {
  private config: RiskConfig = defaultRiskConfig();

  get(): RiskConfig {
    return this.config;
  }

  patch(patch: RiskConfigPatch): RiskConfig {
    const next: RiskConfig = {
      ...this.config,
      ...patch,
      hardPerTradeRiskPctCap: 1,
      tradingWindow: {
        ...this.config.tradingWindow,
        ...(patch.tradingWindow ?? {})
      },
      policyConfirmation: {
        ...this.config.policyConfirmation,
        ...(patch.policyConfirmation ?? {})
      },
      fundedAccount: {
        ...this.config.fundedAccount,
        ...(patch.fundedAccount ?? {})
      }
    };

    if (next.perTradeRiskPctMax > 1) {
      throw new Error('perTradeRiskPctMax cannot exceed hard cap of 1.00%');
    }

    if (next.perTradeRiskPctDefault > next.perTradeRiskPctMax) {
      throw new Error('perTradeRiskPctDefault cannot exceed perTradeRiskPctMax');
    }

    if (next.perTradeRiskPctDefault <= 0 || next.perTradeRiskPctMax <= 0) {
      throw new Error('Risk percentages must be greater than 0');
    }

    const { startHour, startMinute, endHour, endMinute, timezone } = next.tradingWindow;

    if (
      startHour < 0 ||
      startHour > 23 ||
      endHour < 0 ||
      endHour > 23 ||
      startMinute < 0 ||
      startMinute > 59 ||
      endMinute < 0 ||
      endMinute > 59
    ) {
      throw new Error('Trading window time values are out of range');
    }

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new Error('Trading window timezone is invalid');
    }

    const funded = next.fundedAccount;
    if (funded.accountSize <= 0) {
      throw new Error('Funded account size must be greater than 0');
    }
    if (funded.profitTargetPct <= 0 || funded.maxDrawdownPct <= 0 || funded.dailyLossLimitPct <= 0) {
      throw new Error('Funded account target and loss limits must be greater than 0');
    }
    if (!['STATIC', 'EOD_TRAILING'].includes(funded.drawdownMode)) {
      throw new Error('Funded account drawdown mode is invalid');
    }
    if (funded.minRiskPct < 0 || funded.maxRiskPct <= 0 || funded.minRiskPct > funded.maxRiskPct) {
      throw new Error('Funded account risk range is invalid');
    }
    if (funded.maxRiskPct > next.hardPerTradeRiskPctCap) {
      throw new Error('Funded account max risk cannot exceed the hard per-trade risk cap');
    }
    if (funded.confidenceFloor < 0 || funded.confidenceFloor > 1) {
      throw new Error('Funded account confidence floor must be between 0 and 1');
    }
    if (
      funded.dailyLossBufferFraction <= 0 ||
      funded.dailyLossBufferFraction > 1 ||
      funded.drawdownBufferFraction <= 0 ||
      funded.drawdownBufferFraction > 1 ||
      funded.nearTargetProgressPct < 0 ||
      funded.nearTargetProgressPct > 1
    ) {
      throw new Error('Funded account buffer fractions must be between 0 and 1');
    }

    this.config = next;
    return this.config;
  }
}
