import fs from 'node:fs/promises';
import path from 'node:path';

export interface IbkrReconnectStateSnapshot {
  lastConnectedAtMs: number;
  lastLoginRequiredAtMs: number;
  lastFallbackAtMs: number;
  lastSymbols: string[];
  lastSource?: string;
  history: IbkrReconnectHistoryEntry[];
}

export type IbkrReconnectHistoryKind =
  | 'LOGIN_REQUIRED'
  | 'REMINDER'
  | 'CONNECTED'
  | 'FALLBACK_ACTIVATED';

export interface IbkrReconnectHistoryEntry {
  kind: IbkrReconnectHistoryKind;
  atMs: number;
  source?: string;
  symbols: string[];
  detail?: string;
}

const defaultIbkrReconnectState = (): IbkrReconnectStateSnapshot => ({
  lastConnectedAtMs: 0,
  lastLoginRequiredAtMs: 0,
  lastFallbackAtMs: 0,
  lastSymbols: [],
  lastSource: undefined,
  history: []
});

const normalizeTimestamp = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

const normalizeSymbols = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const normalizeSource = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const MAX_HISTORY_ENTRIES = 24;

const normalizeHistoryEntry = (value: unknown): IbkrReconnectHistoryEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<IbkrReconnectHistoryEntry>;
  const kind =
    candidate.kind === 'LOGIN_REQUIRED'
      || candidate.kind === 'REMINDER'
      || candidate.kind === 'CONNECTED'
      || candidate.kind === 'FALLBACK_ACTIVATED'
      ? candidate.kind
      : null;

  if (!kind) {
    return null;
  }

  return {
    kind,
    atMs: normalizeTimestamp(candidate.atMs),
    source: normalizeSource(candidate.source),
    symbols: normalizeSymbols(candidate.symbols),
    detail: typeof candidate.detail === 'string' && candidate.detail.trim().length > 0 ? candidate.detail.trim() : undefined
  };
};

const normalizeHistory = (value: unknown): IbkrReconnectHistoryEntry[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeHistoryEntry(entry))
    .filter((entry): entry is IbkrReconnectHistoryEntry => entry !== null)
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, MAX_HISTORY_ENTRIES);
};

export class IbkrReconnectStateStore {
  private state = defaultIbkrReconnectState();
  private started = false;
  private startPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    if (!this.startPromise) {
      this.startPromise = this.load();
    }

    await this.startPromise;
    this.started = true;
  }

  get(): IbkrReconnectStateSnapshot {
    return {
      ...this.state,
      lastSymbols: [...this.state.lastSymbols],
      history: this.state.history.map((entry) => ({
        ...entry,
        symbols: [...entry.symbols]
      }))
    };
  }

  async patch(patch: Partial<IbkrReconnectStateSnapshot>): Promise<IbkrReconnectStateSnapshot> {
    await this.start();
    this.state = this.normalize({
      ...this.state,
      ...patch
    });
    await this.persist();
    return this.get();
  }

  async appendHistory(entry: IbkrReconnectHistoryEntry): Promise<IbkrReconnectStateSnapshot> {
    await this.start();
    this.state = this.normalize({
      ...this.state,
      history: [entry, ...this.state.history]
    });
    await this.persist();
    return this.get();
  }

  private normalize(candidate: Partial<IbkrReconnectStateSnapshot>): IbkrReconnectStateSnapshot {
    return {
      lastConnectedAtMs: normalizeTimestamp(candidate.lastConnectedAtMs),
      lastLoginRequiredAtMs: normalizeTimestamp(candidate.lastLoginRequiredAtMs),
      lastFallbackAtMs: normalizeTimestamp(candidate.lastFallbackAtMs),
      lastSymbols: normalizeSymbols(candidate.lastSymbols),
      lastSource: normalizeSource(candidate.lastSource),
      history: normalizeHistory(candidate.history)
    };
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<IbkrReconnectStateSnapshot>;
      this.state = this.normalize(parsed);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code !== 'ENOENT') {
        this.state = defaultIbkrReconnectState();
      }
    }
  }

  private async persist(): Promise<void> {
    const snapshot = this.get();
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    });
    await this.writeChain;
  }
}
