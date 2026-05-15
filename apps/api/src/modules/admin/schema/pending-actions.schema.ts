import { sql } from 'drizzle-orm';
import { bigint, index, jsonb, pgEnum, text, timestamp } from 'drizzle-orm/pg-core';

import { admin } from '../../../database/schemas.js';
import { users } from '../../auth/schema/user.schema.js';

export const pendingActionStatusEnum = pgEnum('pending_action_status', [
  'pending',
  'approved',
  'rejected',
  'executed',
  'expired',
]);

export const pendingActionTypeEnum = pgEnum('pending_action_type', [
  'wallet.adjust',
  'charges.rate.update',
  'trade.reverse',
  'broker.suspend',
  'broker.limits.update',
]);

/**
 * 4-eyes approval queue. Mutable across the lifecycle (status transitions
 * pending → approved → executed, or pending → rejected). Each transition
 * MUST emit a corresponding row in `audit.audit_logs` so the full
 * approval history is reconstructable from the audit log alone.
 *
 * Self-approval is rejected at the application layer (`approvedBy != requestedBy`)
 * AND at the DB layer via a CHECK constraint added in the security migration.
 */
export const pendingActions = admin.table(
  'pending_actions',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    actionId: text('action_id').notNull().unique(),
    actionType: pendingActionTypeEnum('action_type').notNull(),
    payload: jsonb('payload').notNull(),
    reason: text('reason').notNull(),

    requestedBy: text('requested_by')
      .notNull()
      .references(() => users.userId, { onDelete: 'restrict' }),
    requestedAt: timestamp('requested_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),

    approvedBy: text('approved_by').references(() => users.userId, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvalComment: text('approval_comment'),

    rejectedBy: text('rejected_by').references(() => users.userId, { onDelete: 'restrict' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),

    executedAt: timestamp('executed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    status: pendingActionStatusEnum('status').notNull().default('pending'),
  },
  (t) => ({
    idxStatus: index('idx_pending_actions_status').on(t.status, t.requestedAt),
    idxRequester: index('idx_pending_actions_requester').on(t.requestedBy),
    idxType: index('idx_pending_actions_type').on(t.actionType),
  }),
);

export type PendingActionRow = typeof pendingActions.$inferSelect;
export type NewPendingActionRow = typeof pendingActions.$inferInsert;
