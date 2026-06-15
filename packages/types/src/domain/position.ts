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

/**
 * A single live open position, marked-to-market by the upstream broker (dios).
 * Unlike a recorded trade (a discrete fill) this represents an OPEN exposure
 * whose `currentPrice` / `unrealizedPnl` change tick-by-tick until it closes.
 * `clientOrderId` is the broker's own trade id, so a row is stable across marks.
 * All decimals are stringified — never JS numbers.
 */
export interface OpenPositionMark {
  readonly clientOrderId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly openPrice: string;
  readonly currentPrice: string;
  readonly unrealizedPnl: string;
}
