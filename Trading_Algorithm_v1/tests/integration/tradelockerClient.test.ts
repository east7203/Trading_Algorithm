import { describe, expect, it } from 'vitest';
import { InMemoryTradeLockerClient } from '../../src/integrations/tradelocker/TradeLockerClient.js';

describe('InMemoryTradeLockerClient integration', () => {
  it('requires authentication before placing an order', async () => {
    const client = new InMemoryTradeLockerClient();

    await expect(
      client.placeOrder({
        symbol: 'NAS100',
        side: 'LONG',
        quantity: 1,
        entry: 100,
        stopLoss: 99,
        takeProfit: [101.5],
        idempotencyKey: 'idemp-1'
      })
    ).rejects.toThrow('TradeLocker client is not authenticated');
  });

  it('supports authenticated order lifecycle with idempotency', async () => {
    const client = new InMemoryTradeLockerClient();
    await client.authenticate();

    const first = await client.placeOrder({
      symbol: 'US30',
      side: 'SHORT',
      quantity: 2,
      entry: 39000,
      stopLoss: 39040,
      takeProfit: [38940],
      idempotencyKey: 'idemp-lifecycle-1'
    });

    const second = await client.placeOrder({
      symbol: 'US30',
      side: 'SHORT',
      quantity: 2,
      entry: 39000,
      stopLoss: 39040,
      takeProfit: [38940],
      idempotencyKey: 'idemp-lifecycle-1'
    });

    expect(first.status).toBe('ACCEPTED');
    expect(second.orderId).toBe(first.orderId);

    const orders = await client.listOrders();
    expect(orders).toHaveLength(1);

    const lookup = await client.getOrderByIdempotencyKey('idemp-lifecycle-1');
    expect(lookup?.orderId).toBe(first.orderId);
  });
});
