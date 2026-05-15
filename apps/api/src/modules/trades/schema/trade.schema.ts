import { sql } from 'drizzle-orm';
import { bigint, index, numeric, text, timestamp } from 'drizzle-orm/pg-core';

import { trading } from '../../../database/schemas.js';
import { brokers } from '../../brokers/schema/broker.schema.js';
import { orderSideEnum, orders } from '../../orders/schema/order.schema.js';

/**
 * Append-only. Runtime role `lp_app` has no UPDATE / DELETE grants on this
 * table; in addition, a BEFORE UPDATE / DELETE trigger raises an exception
 * (defense in depth — see migration 999_security.sql). The repository class
 * exposes only `insert`, `find*`, and `getLastHash` — never `update` or `delete`.
 */
export const trades = trading.table(
  'trades',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    tradeId: text('trade_id').notNull().unique(),
    orderId: text('order_id')
      .notNull()
      .references(() => orders.orderId, { onDelete: 'restrict' }),
    brokerId: text('broker_id')
      .notNull()
      .references(() => brokers.brokerId, { onDelete: 'restrict' }),
    symbol: text('symbol').notNull(),
    side: orderSideEnum('side').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 4 }).notNull(),
    price: numeric('price', { precision: 20, scale: 4 }).notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull(),
    prevHash: text('prev_hash').notNull(),
    hash: text('hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxBrokerExecuted: index('idx_trades_broker_executed').on(t.brokerId, t.executedAt),
    idxSymbolExecuted: index('idx_trades_symbol_executed').on(t.symbol, t.executedAt),
    idxOrder: index('idx_trades_order').on(t.orderId),
  }),
);

export type TradeRow = typeof trades.$inferSelect;
export type NewTradeRow = typeof trades.$inferInsert;
