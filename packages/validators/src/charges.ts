import { z } from 'zod';

import { decimalString, ulidString } from './primitives.js';

export const chargeTypeSchema = z.enum([
  'BROKERAGE',
  'STT',
  'EXCHANGE_FEE',
  'GST',
  'STAMP_DUTY',
  'SEBI_FEE',
  'TRANSACTION_FEE',
]);

export const chargeRecordSchema = z.object({
  tradeId: ulidString,
  type: chargeTypeSchema,
  amount: decimalString,
  description: z.string().min(1).max(120),
});

export type ChargeRecordDto = z.infer<typeof chargeRecordSchema>;
