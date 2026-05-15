import { z } from 'zod';

import {
  ALL_ORDER_SIDES,
  ALL_ORDER_TYPES,
  ALL_TIME_IN_FORCE,
  ALL_ORDER_STATUSES,
} from '@lp/constants';

import {
  brokerIdString,
  decimalString,
  isoTimestamp,
  positiveDecimalString,
  symbolString,
  ulidString,
} from './primitives.js';

export const orderSideSchema = z.enum(ALL_ORDER_SIDES as [string, ...string[]]);
export const orderTypeSchema = z.enum(ALL_ORDER_TYPES as [string, ...string[]]);
export const timeInForceSchema = z.enum(ALL_TIME_IN_FORCE as [string, ...string[]]);
export const orderStatusSchema = z.enum(ALL_ORDER_STATUSES as [string, ...string[]]);

export const orderRequestSchema = z
  .object({
    brokerId: brokerIdString,
    clientOrderId: z.string().min(1).max(64),
    symbol: symbolString,
    side: orderSideSchema,
    type: orderTypeSchema,
    quantity: positiveDecimalString,
    price: decimalString.optional(),
    timeInForce: timeInForceSchema.default('DAY'),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'LIMIT' || data.type === 'STOP_LIMIT') {
      if (data.price === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['price'],
          message: `price is required for ${data.type} orders`,
        });
      }
    }
    if (data.type === 'MARKET' && data.price !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'price must be omitted for MARKET orders',
      });
    }
  });

export const orderRecordSchema = z.object({
  orderId: ulidString,
  clientOrderId: z.string().min(1).max(64),
  brokerId: brokerIdString,
  symbol: symbolString,
  side: orderSideSchema,
  type: orderTypeSchema,
  quantity: positiveDecimalString,
  price: decimalString.optional(),
  timeInForce: timeInForceSchema,
  status: orderStatusSchema,
  receivedAt: isoTimestamp,
  updatedAt: isoTimestamp,
});

export type OrderRequest = z.infer<typeof orderRequestSchema>;
export type OrderRecordDto = z.infer<typeof orderRecordSchema>;
