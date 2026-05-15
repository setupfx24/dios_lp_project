import { Injectable } from '@nestjs/common';

import { Money } from '@lp/utils';

export interface MatchableOrder {
  readonly orderId: string;
  readonly brokerId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly price?: string;
  readonly type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
}

export interface Fill {
  readonly orderId: string;
  readonly brokerId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly price: string;
}

/**
 * Stub matching engine. The production system would maintain a price-time
 * priority order book per symbol, persisted in Postgres + Redis. For
 * scaffolding purposes we synthesize a fill at the limit price (or a
 * `referencePrice` injected by the caller for MARKET).
 */
@Injectable()
export class MatchingService {
  match(order: MatchableOrder, referencePrice: string): Fill {
    const fillPrice = order.type === 'MARKET' || !order.price ? referencePrice : order.price;
    // Defensive: ensure the reference is a valid Money string.
    void new Money(fillPrice);
    return {
      orderId: order.orderId,
      brokerId: order.brokerId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: fillPrice,
    };
  }
}
