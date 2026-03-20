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
});
