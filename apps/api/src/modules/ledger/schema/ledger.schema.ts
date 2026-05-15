import { sql } from 'drizzle-orm';
import { bigint, index, numeric, pgEnum, text, timestamp } from 'drizzle-orm/pg-core';

import { ledger as ledgerSchema } from '../../../database/schemas.js';
import { brokers } from '../../brokers/schema/broker.schema.js';

export const ledgerDirectionEnum = pgEnum('ledger_direction', ['DEBIT', 'CREDIT']);
export const ledgerReferenceTypeEnum = pgEnum('ledger_reference_type', [
  'TRADE',
  'CHARGE',
  'DEPOSIT',
  'WITHDRAWAL',
  'ADJUSTMENT',
]);

export const wallets = ledgerSchema.table(
  'wallets',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    walletId: text('wallet_id').notNull().unique(),
    brokerId: text('broker_id')
      .notNull()
      .references(() => brokers.brokerId, { onDelete: 'restrict' }),
    currency: text('currency').notNull().default('INR'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxBrokerCurrency: index('idx_wallets_broker_currency').on(t.brokerId, t.currency),
  }),
);

/**
 * Append-only. See trades for the same three-layer enforcement (repo API
 * surface, role grants, BEFORE UPDATE / DELETE trigger).
 */
export const ledgerEntries = ledgerSchema.table(
  'ledger_entries',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    entryId: text('entry_id').notNull().unique(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.walletId, { onDelete: 'restrict' }),
    direction: ledgerDirectionEnum('direction').notNull(),
    amount: numeric('amount', { precision: 20, scale: 4 }).notNull(),
    currency: text('currency').notNull(),
    referenceType: ledgerReferenceTypeEnum('reference_type').notNull(),
    referenceId: text('reference_id').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxWalletCreated: index('idx_ledger_wallet_created').on(t.walletId, t.createdAt),
    idxReference: index('idx_ledger_reference').on(t.referenceType, t.referenceId),
  }),
);

export type WalletRow = typeof wallets.$inferSelect;
export type NewWalletRow = typeof wallets.$inferInsert;
export type LedgerEntryRow = typeof ledgerEntries.$inferSelect;
export type NewLedgerEntryRow = typeof ledgerEntries.$inferInsert;
