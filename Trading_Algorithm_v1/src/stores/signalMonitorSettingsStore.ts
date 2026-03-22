import fs from 'node:fs/promises';
import path from 'node:path';
import type { SetupType, SignalMonitorSettings, SymbolCode } from '../domain/types.js';

export type SignalMonitorSettingsPatch = Partial<SignalMonitorSettings>;

const VALID_SYMBOLS: SymbolCode[] = ['NQ', 'ES'];
const VALID_SETUPS: SetupType[] = [
  'LIQUIDITY_SWEEP_MSS_FVG_CONTINUATION',
  'LIQUIDITY_SWEEP_REVERSAL_SESSION_EXTREMES',
  'DISPLACEMENT_ORDER_BLOCK_RETEST_CONTINUATION',
  'NY_BREAK_RETEST_MOMENTUM',
  'WERLEIN_FOREVER_MODEL'
];

export const defaultSignalMonitorSettings = (): SignalMonitorSettings => ({
  timezone: 'America/New_York',
  sessionStartHour: 8,
  sessionStartMinute: 30,
  sessionEndHour: 10,
  sessionEndMinute: 30,
  nyRangeMinutes: 60,
  minFinalScore: 74,
  enabledSymbols: [...VALID_SYMBOLS],
  enabledSetups: [...VALID_SETUPS],
  requireOpeningRangeComplete: true,
  aPlusOnlyAfterFirstHour: true,
  aPlusMinScore: 82
});

const ensureTimeComponent = (value: number, label: string, max: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${label} is out of range`);
  }
};

const ensureSubset = <T extends string>(input: T[], allowed: T[], label: string): void => {
  if (input.length === 0) {
    throw new Error(`${label} cannot be empty`);
  }
  for (const item of input) {
    if (!allowed.includes(item)) {
      throw new Error(`${label} contains unsupported value ${item}`);
    }
  }
};

export class SignalMonitorSettingsStore {
  private settings = defaultSignalMonitorSettings();

  constructor(private readonly filePath: string) {}

  async start(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<SignalMonitorSettings>;
      this.settings = this.validate({
        ...defaultSignalMonitorSettings(),
        ...parsed
      });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.settings = defaultSignalMonitorSettings();
      }
    }
  }

  seed(patch: SignalMonitorSettingsPatch): void {
    this.settings = this.validate({
      ...this.settings,
      ...patch
    });
  }

  get(): SignalMonitorSettings {
    return structuredClone(this.settings);
  }

  async patch(patch: SignalMonitorSettingsPatch): Promise<SignalMonitorSettings> {
    const next = this.validate({
      ...this.settings,
      ...patch
    });
    this.settings = next;
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(this.settings, null, 2)}\n`, 'utf8');
    return this.get();
  }

  private validate(candidate: SignalMonitorSettings): SignalMonitorSettings {
    const timezone = candidate.timezone.trim();
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    } catch {
      throw new Error('Signal monitor timezone is invalid');
    }

    ensureTimeComponent(candidate.sessionStartHour, 'sessionStartHour', 23);
    ensureTimeComponent(candidate.sessionStartMinute, 'sessionStartMinute', 59);
    ensureTimeComponent(candidate.sessionEndHour, 'sessionEndHour', 23);
    ensureTimeComponent(candidate.sessionEndMinute, 'sessionEndMinute', 59);

    const startMinutes = candidate.sessionStartHour * 60 + candidate.sessionStartMinute;
    const endMinutes = candidate.sessionEndHour * 60 + candidate.sessionEndMinute;
    if (endMinutes <= startMinutes) {
      throw new Error('Signal monitor session end must be after session start');
    }

    if (!Number.isFinite(candidate.nyRangeMinutes) || candidate.nyRangeMinutes < 15 || candidate.nyRangeMinutes > 180) {
      throw new Error('nyRangeMinutes must be between 15 and 180');
    }

    if (!Number.isFinite(candidate.minFinalScore) || candidate.minFinalScore < 0 || candidate.minFinalScore > 100) {
      throw new Error('minFinalScore must be between 0 and 100');
    }

    if (!Number.isFinite(candidate.aPlusMinScore) || candidate.aPlusMinScore < 0 || candidate.aPlusMinScore > 100) {
      throw new Error('aPlusMinScore must be between 0 and 100');
    }

    ensureSubset(candidate.enabledSymbols, VALID_SYMBOLS, 'enabledSymbols');
    ensureSubset(candidate.enabledSetups, VALID_SETUPS, 'enabledSetups');

    return {
      ...candidate,
      timezone,
      enabledSymbols: [...candidate.enabledSymbols],
      enabledSetups: [...candidate.enabledSetups]
    };
  }
}
