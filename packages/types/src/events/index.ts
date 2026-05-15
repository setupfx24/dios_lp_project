import type { OrderRecord } from '../domain/order.js';
import type { PositionRecord } from '../domain/position.js';
import type { TradeRecord } from '../domain/trade.js';

export interface TradeExecutedEvent {
  readonly type: 'trade.executed';
  readonly brokerId: string;
  readonly trade: TradeRecord;
}

export interface OrderUpdatedEvent {
  readonly type: 'order.updated';
  readonly brokerId: string;
  readonly order: OrderRecord;
}

export interface PositionUpdatedEvent {
  readonly type: 'position.updated';
  readonly brokerId: string;
  readonly position: PositionRecord;
}

export type DomainEvent = TradeExecutedEvent | OrderUpdatedEvent | PositionUpdatedEvent;
