import { v4 as uuidv4 } from 'uuid';
import type { ExecutionIntent, OrderEvent, TradeJournalEntry } from '../domain/types.js';

export class JournalStore {
  private events: OrderEvent[] = [];
  private trades: TradeJournalEntry[] = [];
  private intents = new Map<string, ExecutionIntent>();

  addEvent(event: Omit<OrderEvent, 'eventId'>): OrderEvent {
    const built: OrderEvent = {
      ...event,
      eventId: uuidv4()
    };
    this.events.push(built);
    return built;
  }

  listEvents(): OrderEvent[] {
    return [...this.events];
  }

  upsertIntent(intent: ExecutionIntent): void {
    this.intents.set(intent.intentId, intent);
  }

  getIntent(intentId: string): ExecutionIntent | undefined {
    return this.intents.get(intentId);
  }

  listIntents(status?: ExecutionIntent['status']): ExecutionIntent[] {
    const intents = [...this.intents.values()];
    if (!status) {
      return intents.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return intents
      .filter((intent) => intent.status === status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  addOrUpdateTrade(entry: TradeJournalEntry): void {
    const existingIndex = this.trades.findIndex((trade) => trade.intentId === entry.intentId);
    if (existingIndex >= 0) {
      this.trades[existingIndex] = entry;
      return;
    }
    this.trades.push(entry);
  }

  listTrades(): TradeJournalEntry[] {
    return [...this.trades].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}
