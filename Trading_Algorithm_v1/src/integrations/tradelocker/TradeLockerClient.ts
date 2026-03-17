import { v4 as uuidv4 } from 'uuid';
import type { Side, SymbolCode } from '../../domain/types.js';

export interface TradeLockerOrderRequest {
  symbol: SymbolCode;
  side: Side;
  quantity: number;
  entry: number;
  stopLoss: number;
  takeProfit: number[];
  idempotencyKey: string;
}

export interface TradeLockerOrder {
  orderId: string;
  symbol: SymbolCode;
  side: Side;
  quantity: number;
  entry: number;
  stopLoss: number;
  takeProfit: number[];
  status: 'ACCEPTED';
  idempotencyKey: string;
  createdAt: string;
}

export interface TradeLockerClient {
  authenticate(): Promise<void>;
  placeOrder(order: TradeLockerOrderRequest): Promise<TradeLockerOrder>;
  getOrderByIdempotencyKey(idempotencyKey: string): Promise<TradeLockerOrder | undefined>;
  listOrders(): Promise<TradeLockerOrder[]>;
}

export class InMemoryTradeLockerClient implements TradeLockerClient {
  private authenticated = false;
  private ordersByIdempotency = new Map<string, TradeLockerOrder>();

  async authenticate(): Promise<void> {
    this.authenticated = true;
  }

  async placeOrder(order: TradeLockerOrderRequest): Promise<TradeLockerOrder> {
    if (!this.authenticated) {
      throw new Error('TradeLocker client is not authenticated');
    }

    const existing = this.ordersByIdempotency.get(order.idempotencyKey);
    if (existing) {
      return existing;
    }

    const created: TradeLockerOrder = {
      orderId: uuidv4(),
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      entry: order.entry,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      idempotencyKey: order.idempotencyKey,
      status: 'ACCEPTED',
      createdAt: new Date().toISOString()
    };

    this.ordersByIdempotency.set(order.idempotencyKey, created);
    return created;
  }

  async getOrderByIdempotencyKey(idempotencyKey: string): Promise<TradeLockerOrder | undefined> {
    return this.ordersByIdempotency.get(idempotencyKey);
  }

  async listOrders(): Promise<TradeLockerOrder[]> {
    return [...this.ordersByIdempotency.values()];
  }
}
