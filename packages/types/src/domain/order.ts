export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
export type TimeInForce = 'DAY' | 'IOC' | 'FOK' | 'GTC';
export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED';

export interface OrderRecord {
  readonly orderId: string;
  readonly clientOrderId: string;
  readonly brokerId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly type: OrderType;
  /** Stringified decimal — never a JS Number. */
  readonly quantity: string;
  /** Stringified decimal. Required for LIMIT/STOP_LIMIT, optional otherwise. */
  readonly price?: string;
  readonly timeInForce: TimeInForce;
  readonly status: OrderStatus;
  readonly receivedAt: string;
  readonly updatedAt: string;
}
