import { sql } from 'drizzle-orm';
import { bigint, index, text, timestamp } from 'drizzle-orm/pg-core';

import { auth } from '../../../database/schemas.js';

export const brokers = auth.table(
  'brokers',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    brokerId: text('broker_id').notNull().unique(),
    displayName: text('display_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    status: text('status', { enum: ['active', 'suspended', 'closed'] })
      .notNull()
      .default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxStatus: index('idx_brokers_status').on(t.status),
  }),
);

export const apiKeys = auth.table(
  'api_keys',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    apiKeyId: text('api_key_id').notNull().unique(),
    brokerId: text('broker_id')
      .notNull()
      .references(() => brokers.brokerId, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    secretHash: text('secret_hash').notNull(),
    ipAllowlist: text('ip_allowlist')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    idxBroker: index('idx_api_keys_broker').on(t.brokerId),
    idxPrefix: index('idx_api_keys_prefix').on(t.keyPrefix),
  }),
);

export type BrokerRow = typeof brokers.$inferSelect;
export type NewBrokerRow = typeof brokers.$inferInsert;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
