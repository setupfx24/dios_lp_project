export interface PositionRecord {
  readonly brokerId: string;
  readonly symbol: string;
  /** Stringified signed decimal. Positive = long, negative = short. */
  readonly netQuantity: string;
  /** Stringified decimal — volume-weighted average price of remaining position. */
  readonly avgPrice: string;
  readonly realizedPnl: string;
  readonly unrealizedPnl: string;
  readonly updatedAt: string;
}
