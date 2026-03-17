import type { NewsEvent } from '../domain/types.js';

const MS_PER_MINUTE = 60_000;

export const isInBlockedNewsWindow = (
  newsEvents: NewsEvent[],
  nowIso: string,
  blockBeforeMinutes = 15,
  blockAfterMinutes = 30
): boolean => {
  const now = new Date(nowIso).getTime();

  return newsEvents.some((event) => {
    if (event.currency !== 'USD' || event.impact !== 'high') {
      return false;
    }

    const eventTime = new Date(event.startsAt).getTime();
    const windowStart = eventTime - blockBeforeMinutes * MS_PER_MINUTE;
    const windowEnd = eventTime + blockAfterMinutes * MS_PER_MINUTE;

    return now >= windowStart && now <= windowEnd;
  });
};
