import { z } from 'zod';

import { orderSideSchema } from './orders.js';
import {
  brokerIdString,
  isoTimestamp,
  positiveDecimalString,
  symbolString,
  ulidString,
} from './primitives.js';

const HEX_64 = /^[0-9a-f]{64}$/;

export const tradeRecordSchema = z.object({
  tradeId: ulidString,
  orderId: ulidString,
  brokerId: brokerIdString,
  symbol: symbolString,
  side: orderSideSchema,
  quantity: positiveDecimalString,
  price: positiveDecimalString,
  executedAt: isoTimestamp,
  prevHash: z.string().regex(HEX_64, 'prevHash must be 64-char lowercase hex'),
  hash: z.string().regex(HEX_64, 'hash must be 64-char lowercase hex'),
});

export type TradeRecordDto = z.infer<typeof tradeRecordSchema>;

export const tradeListQuerySchema = z.object({
  brokerId: brokerIdString.optional(),
  symbol: symbolString.optional(),
  side: orderSideSchema.optional(),
  from: isoTimestamp.optional(),
  to: isoTimestamp.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export type TradeListQuery = z.infer<typeof tradeListQuerySchema>;
