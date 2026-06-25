import { describe, expect, it } from 'vitest';
import { evaluateNewsContext } from '../../src/services/newsContextService.js';

describe('evaluateNewsContext', () => {
  it('penalizes relevant cross-market events before they hit the hard block window', () => {
    const context = evaluateNewsContext(
      [
        {
          currency: 'EUR',
          country: 'Euro Area',
          impact: 'high',
          startsAt: '2026-03-07T16:30:00.000Z',
          source: 'calendar',
          title: 'Euro Area CPI'
        }
      ],
      '2026-03-07T15:20:00.000Z',
      'ES'
    );

    expect(context.blocked).toBe(false);
    expect(context.scoreAdjustment).toBeLessThan(0);
    expect(context.primaryEvent?.severity).toBe('critical');
  });

  it('blocks during the critical macro window for US index futures', () => {
    const context = evaluateNewsContext(
      [
        {
          currency: 'USD',
          impact: 'high',
          startsAt: '2026-03-07T15:20:00.000Z',
          source: 'calendar',
          title: 'Non-Farm Payrolls'
        }
      ],
      '2026-03-07T15:10:00.000Z',
      'NQ'
    );

    expect(context.blocked).toBe(true);
    expect(context.reasonCodes).toContain('CRITICAL_MACRO_EVENT_WINDOW_BLOCK');
    expect(context.summary).toContain('Non-Farm Payrolls');
  });

  it('blocks high-impact USD red-folder events one hour before and after release', () => {
    const event = {
      currency: 'USD',
      impact: 'high' as const,
      startsAt: '2026-03-07T15:30:00.000Z',
      source: 'calendar',
      title: 'Building Permits'
    };

    const before = evaluateNewsContext([event], '2026-03-07T14:31:00.000Z', 'NQ');
    const after = evaluateNewsContext([event], '2026-03-07T16:29:00.000Z', 'ES');

    expect(before.blocked).toBe(true);
    expect(before.reasonCodes).toContain('HIGH_IMPACT_USD_NEWS_WINDOW_BLOCK');
    expect(after.blocked).toBe(true);
    expect(after.reasonCodes).toContain('HIGH_IMPACT_USD_NEWS_WINDOW_BLOCK');
  });

  it('does not hard block high-impact USD events outside the one-hour blackout', () => {
    const event = {
      currency: 'USD',
      impact: 'high' as const,
      startsAt: '2026-03-07T15:30:00.000Z',
      source: 'calendar',
      title: 'Building Permits'
    };

    const context = evaluateNewsContext([event], '2026-03-07T14:29:00.000Z', 'NQ');

    expect(context.blocked).toBe(false);
    expect(context.reasonCodes).not.toContain('HIGH_IMPACT_USD_NEWS_WINDOW_BLOCK');
  });
});
