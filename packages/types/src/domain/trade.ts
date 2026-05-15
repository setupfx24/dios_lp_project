import type { OrderSide } from './order.js';

export interface TradeRecord {
  readonly tradeId: string;
  readonly orderId: string;
  readonly brokerId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  /** Stringified decimal. */
  readonly quantity: string;
  /** Stringified decimal. */
  readonly price: string;
  readonly executedAt: string;
  /** Hex SHA-256 of the previous trade in the broker's chain, or 64 zero bytes for the first. */
  readonly prevHash: string;
  /** Hex SHA-256 of this trade's canonical JSON together with prevHash. */
  readonly hash: string;
}

export interface TradeWithCharges extends TradeRecord {
  readonly charges: readonly ChargeRecord[];
  readonly netAmount: string;
}

export type ChargeType =
  | 'BROKERAGE'
  | 'STT'
  | 'EXCHANGE_FEE'
  | 'GST'
  | 'STAMP_DUTY'
  | 'SEBI_FEE'
  | 'TRANSACTION_FEE';

export interface ChargeRecord {
  readonly tradeId: string;
  readonly type: ChargeType;
  /** Stringified decimal. */
  readonly amount: string;
  readonly description: string;
}
