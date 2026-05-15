import { sql } from 'drizzle-orm';
import { bigint, index, numeric, pgEnum, text, timestamp } from 'drizzle-orm/pg-core';

import { trading } from '../../../database/schemas.js';
import { trades } from '../../trades/schema/trade.schema.js';

export const chargeTypeEnum = pgEnum('charge_type', [
  'BROKERAGE',
  'STT',
  'EXCHANGE_FEE',
  'GST',
  'STAMP_DUTY',
  'SEBI_FEE',
  'TRANSACTION_FEE',
]);

export const charges = trading.table(
  'charges',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    tradeId: text('trade_id')
      .notNull()
      .references(() => trades.tradeId, { onDelete: 'restrict' }),
    type: chargeTypeEnum('type').notNull(),
    amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxTrade: index('idx_charges_trade').on(t.tradeId),
    idxType: index('idx_charges_type').on(t.type),
  }),
);

export type ChargeRow = typeof charges.$inferSelect;
export type NewChargeRow = typeof charges.$inferInsert;
