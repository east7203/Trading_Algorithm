import type { NewsEvent } from '../../domain/types.js';

export interface EconomicCalendarClient {
  sourceName: string;
  listUpcomingEvents(): Promise<NewsEvent[]>;
}

export class InMemoryEconomicCalendarClient implements EconomicCalendarClient {
  sourceName = 'paid-economic-calendar-api';

  constructor(private events: NewsEvent[] = []) {}

  setEvents(events: NewsEvent[]): void {
    this.events = events;
  }

  async listUpcomingEvents(): Promise<NewsEvent[]> {
    return this.events;
  }
}
