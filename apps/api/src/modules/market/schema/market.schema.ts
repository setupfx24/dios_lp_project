import { sql } from 'drizzle-orm';
import { bigint, index, integer, numeric, text, timestamp } from 'drizzle-orm/pg-core';

import { market } from '../../../database/schemas.js';

export const instruments = market.table(
  'instruments',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    symbol: text('symbol').notNull().unique(),
    exchange: text('exchange', { enum: ['NSE', 'BSE'] }).notNull(),
    segment: text('segment', { enum: ['EQ', 'FUT', 'OPT'] }).notNull(),
    lotSize: integer('lot_size').notNull().default(1),
    tickSize: numeric('tick_size', { precision: 10, scale: 4 }).notNull().default('0.05'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxSegment: index('idx_instruments_segment').on(t.segment),
  }),
);

/**
 * TimescaleDB hypertable. The `create_hypertable` call is in the security
 * migration alongside the extension creation — Drizzle doesn't model that
 * directly, so the table here is the regular Postgres half.
 */
export const ticks = market.table(
  'ticks',
  {
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
    symbol: text('symbol').notNull(),
    bid: numeric('bid', { precision: 20, scale: 4 }),
    ask: numeric('ask', { precision: 20, scale: 4 }),
    last: numeric('last', { precision: 20, scale: 4 }),
    volume: numeric('volume', { precision: 20, scale: 4 }),
  },
  (t) => ({
    idxSymbolTs: index('idx_ticks_symbol_ts').on(t.symbol, t.timestamp),
  }),
);

export type InstrumentRow = typeof instruments.$inferSelect;
export type NewInstrumentRow = typeof instruments.$inferInsert;
export type TickRow = typeof ticks.$inferSelect;
export type NewTickRow = typeof ticks.$inferInsert;
