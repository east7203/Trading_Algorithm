import type { NewsEvent } from '../domain/types.js';
import { evaluateNewsContext } from './newsContextService.js';

export const isInBlockedNewsWindow = (newsEvents: NewsEvent[], nowIso: string): boolean =>
  evaluateNewsContext(newsEvents, nowIso, 'NQ').blocked;
