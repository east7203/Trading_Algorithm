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
    timezone: 'America/New_York',
    startHour: 8,
    startMinute: 30,
    endHour: 11,
    endMinute: 30
  },
  policyConfirmation: {
    firmUsageApproved: false,
    platformUsageApproved: false
  }
});

export type RiskConfigPatch = Partial<
  Omit<RiskConfig, 'hardPerTradeRiskPctCap' | 'policyConfirmation' | 'tradingWindow'>
> & {
  policyConfirmation?: Partial<RiskConfig['policyConfirmation']>;
  tradingWindow?: Partial<RiskConfig['tradingWindow']>;
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

    this.config = next;
    return this.config;
  }
}
