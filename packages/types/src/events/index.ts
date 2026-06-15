import type { OrderRecord } from '../domain/order.js';
import type { OpenPositionMark, PositionRecord } from '../domain/position.js';
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

/**
 * A full snapshot of a broker's currently-open positions, pushed on every
 * mark-to-market tick from the upstream broker. The set is authoritative and
 * replaces the client's blotter wholesale, so a position that closed simply
 * drops out of the next snapshot (no per-row "close" event needed).
 */
export interface PositionSnapshotEvent {
  readonly type: 'position.snapshot';
  readonly brokerId: string;
  readonly marks: readonly OpenPositionMark[];
  /** Sum of every mark's unrealizedPnl (stringified, may be negative). */
  readonly totalUnrealizedPnl: string;
  /** Epoch-ms the upstream broker computed this snapshot. */
  readonly ts: number;
}

export type DomainEvent =
  | TradeExecutedEvent
  | OrderUpdatedEvent
  | PositionUpdatedEvent
  | PositionSnapshotEvent;
