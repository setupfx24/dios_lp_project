import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';

import { audit } from '../../../database/schemas.js';

/**
 * Append-only. Every guard rejection, login attempt, admin action lands here.
 * Same triple-defense pattern as trades / ledger_entries.
 */
export const auditLogs = audit.table(
  'audit_logs',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    auditId: text('audit_id').notNull().unique(),
    actorType: text('actor_type', {
      enum: ['user', 'broker_api', 'system'],
    }).notNull(),
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    outcome: text('outcome', { enum: ['success', 'failure'] }).notNull(),
    metadata: jsonb('metadata'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxActor: index('idx_audit_actor').on(t.actorType, t.actorId, t.createdAt),
    idxAction: index('idx_audit_action').on(t.action, t.createdAt),
    idxResource: index('idx_audit_resource').on(t.resourceType, t.resourceId),
  }),
);

export type AuditLogRow = typeof auditLogs.$inferSelect;
export type NewAuditLogRow = typeof auditLogs.$inferInsert;
