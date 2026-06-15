import { z } from 'zod';

import {
  brokerIdString,
  decimalString,
  positiveDecimalString,
  symbolString,
} from './primitives.js';

/**
 * Live open-position mark, marked-to-market by the upstream broker. `quantity`
 * and prices are positive decimals; `unrealizedPnl` is signed (a losing trade
 * is negative). Money always crosses the wire as a string.
 */
export const openPositionMarkSchema = z.object({
  clientOrderId: z.string().trim().min(1).max(64),
  symbol: symbolString,
  side: z.enum(['BUY', 'SELL']),
  quantity: positiveDecimalString,
  openPrice: positiveDecimalString,
  currentPrice: positiveDecimalString,
  unrealizedPnl: decimalString,
});

export type OpenPositionMarkDto = z.infer<typeof openPositionMarkSchema>;

/**
 * Inbound batch (HMAC-signed POST /api/v1/broker/positions/mark-to-market).
 * The full set of the broker's open positions at `ts`; the LP republishes it
 * verbatim to the broker's dashboards. Capped to keep a single tick bounded.
 */
export const positionSnapshotRequestSchema = z.object({
  brokerId: brokerIdString,
  ts: z.number().int().nonnegative(),
  marks: z.array(openPositionMarkSchema).max(2000),
});

export type PositionSnapshotRequest = z.infer<typeof positionSnapshotRequestSchema>;

/** Server→client snapshot payload (cached + pushed). */
export const positionSnapshotSchema = z.object({
  brokerId: brokerIdString,
  marks: z.array(openPositionMarkSchema),
  totalUnrealizedPnl: decimalString,
  ts: z.number().int().nonnegative(),
});

export type PositionSnapshotDto = z.infer<typeof positionSnapshotSchema>;
