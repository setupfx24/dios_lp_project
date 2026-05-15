import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import { ulid } from '@lp/utils/id';

import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import {
  pendingActions,
  type NewPendingActionRow,
  type PendingActionRow,
} from '../schema/pending-actions.schema.js';

export interface CreatePendingActionInput {
  actionType: PendingActionRow['actionType'];
  payload: Record<string, unknown>;
  reason: string;
  requestedBy: string;
  expiresAt: Date;
}

@Injectable()
export class PendingActionsRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async create(input: CreatePendingActionInput, tx?: Db): Promise<PendingActionRow> {
    const exec = tx ?? this.db;
    const row: NewPendingActionRow = {
      actionId: ulid(),
      actionType: input.actionType,
      payload: input.payload,
      reason: input.reason,
      requestedBy: input.requestedBy,
      expiresAt: input.expiresAt,
    };
    const inserted = await exec.insert(pendingActions).values(row).returning();
    const created = inserted[0];
    if (!created) {
      throw new Error('PendingActionsRepository.create: no row returned');
    }
    return created;
  }

  async findById(actionId: string): Promise<PendingActionRow | null> {
    const rows = await this.db
      .select()
      .from(pendingActions)
      .where(eq(pendingActions.actionId, actionId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listPending(limit = 100): Promise<PendingActionRow[]> {
    return this.db
      .select()
      .from(pendingActions)
      .where(eq(pendingActions.status, 'pending'))
      .orderBy(desc(pendingActions.requestedAt))
      .limit(limit);
  }

  /**
   * Atomically transition pending → approved, with self-approval check at the
   * SQL layer (the DB CHECK constraint also enforces this).
   */
  async approve(
    actionId: string,
    approverId: string,
    comment: string | null,
    tx?: Db,
  ): Promise<PendingActionRow | null> {
    const exec = tx ?? this.db;
    const updated = await exec
      .update(pendingActions)
      .set({
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
        approvalComment: comment,
      })
      .where(
        and(
          eq(pendingActions.actionId, actionId),
          eq(pendingActions.status, 'pending'),
          sql`${pendingActions.requestedBy} <> ${approverId}`,
        ),
      )
      .returning();
    return updated[0] ?? null;
  }

  async reject(
    actionId: string,
    rejectorId: string,
    reason: string,
    tx?: Db,
  ): Promise<PendingActionRow | null> {
    const exec = tx ?? this.db;
    const updated = await exec
      .update(pendingActions)
      .set({
        status: 'rejected',
        rejectedBy: rejectorId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      })
      .where(
        and(
          eq(pendingActions.actionId, actionId),
          eq(pendingActions.status, 'pending'),
          sql`${pendingActions.requestedBy} <> ${rejectorId}`,
        ),
      )
      .returning();
    return updated[0] ?? null;
  }

  async markExecuted(actionId: string, tx?: Db): Promise<void> {
    const exec = tx ?? this.db;
    await exec
      .update(pendingActions)
      .set({ status: 'executed', executedAt: new Date() })
      .where(eq(pendingActions.actionId, actionId));
  }
}
