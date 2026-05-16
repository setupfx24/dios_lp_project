import { dispatch, type PendingAction, type PendingActionType } from '@lp/core';
import { ulid } from '@lp/utils/id';

import { pgLedgerOps } from '../ledger/pg-ledger-ops.js';

import type { AppLogger } from '../logger.js';
import type pg from 'pg';

/**
 * Polls `admin.pending_actions` for `status = 'approved'` rows and executes
 * the underlying action via the shared `@lp/core` dispatcher (same code path
 * as the below-threshold synchronous handler in `apps/api`).
 *
 * Each row is processed inside its own short transaction:
 *   BEGIN
 *     guard:    UPDATE ... SET status='executed' WHERE action_id=$1 AND status='approved'
 *     execute:  dispatch(action, { ledger: pgLedgerOps(client) })
 *     audit:    INSERT INTO audit.audit_logs (...)
 *   COMMIT
 *
 * The guard UPDATE returning rowCount=0 means a peer already claimed it —
 * we skip without error. If `dispatch` throws, the tx rolls back (the row
 * goes back to `approved` automatically) and we record a failure audit
 * outside the rolled-back tx so the operator has forensic context.
 *
 * Production should swap polling for `LISTEN`/`NOTIFY` — the dispatch
 * logic above doesn't change.
 */
export class ApprovalWatcher {
  constructor(
    private readonly pool: pg.Pool,
    private readonly logger: AppLogger,
  ) {}

  async pollOnce(): Promise<{ processed: number; failed: number }> {
    const rows = (
      await this.pool.query<{
        action_id: string;
        action_type: PendingActionType;
        payload: unknown;
        approved_by: string | null;
      }>(
        `SELECT action_id, action_type, payload, approved_by
         FROM admin.pending_actions
         WHERE status = 'approved'
         ORDER BY approved_at ASC
         LIMIT 25`,
      )
    ).rows;

    let processed = 0;
    let failed = 0;
    for (const row of rows) {
      const ok = await this.executeOne({
        actionId: row.action_id,
        type: row.action_type,
        payload: row.payload,
        approvedBy: row.approved_by,
      });
      if (ok) {
        processed++;
      } else {
        failed++;
      }
    }
    return { processed, failed };
  }

  private async executeOne(args: {
    actionId: string;
    type: PendingActionType;
    payload: unknown;
    approvedBy: string | null;
  }): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Claim the row atomically. If another worker raced us, this returns 0.
      const claim = await client.query(
        `UPDATE admin.pending_actions
            SET status = 'executed', executed_at = now()
          WHERE action_id = $1 AND status = 'approved'`,
        [args.actionId],
      );
      if (claim.rowCount === 0) {
        await client.query('ROLLBACK');
        return false;
      }

      const action: PendingAction = {
        actionId: args.actionId,
        type: args.type,
        payload: args.payload,
      };
      const result = await dispatch(action, { ledger: pgLedgerOps(client) });

      await client.query(
        `INSERT INTO audit.audit_logs
           (audit_id, actor_type, actor_id, action, resource_type, resource_id, outcome, metadata)
         VALUES ($1, 'system', 'approval-watcher', 'pending.execute',
                 'pending_action', $2, 'success', $3::jsonb)`,
        [
          ulid(),
          args.actionId,
          JSON.stringify({ type: args.type, approvedBy: args.approvedBy, result }),
        ],
      );

      await client.query('COMMIT');
      this.logger.info(
        { actionId: args.actionId, type: args.type, result },
        'approval-watcher: action executed',
      );
      return true;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      // Best-effort failure audit OUTSIDE the rolled-back tx.
      try {
        await this.pool.query(
          `INSERT INTO audit.audit_logs
             (audit_id, actor_type, actor_id, action, resource_type, resource_id, outcome, metadata)
           VALUES ($1, 'system', 'approval-watcher', 'pending.execute',
                   'pending_action', $2, 'failure', $3::jsonb)`,
          [
            ulid(),
            args.actionId,
            JSON.stringify({
              type: args.type,
              error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
            }),
          ],
        );
      } catch (auditErr) {
        this.logger.error(
          { actionId: args.actionId, err: auditErr },
          'approval-watcher: failed to write failure audit',
        );
      }
      this.logger.error(
        { actionId: args.actionId, type: args.type, err },
        'approval-watcher: dispatch failed; row reverted to approved',
      );
      return false;
    } finally {
      client.release();
    }
  }

  async expireStale(retentionHours = 24): Promise<{ expired: number }> {
    const result = await this.pool.query(
      `UPDATE admin.pending_actions
          SET status = 'expired'
        WHERE status = 'pending'
          AND requested_at < now() - ($1 || ' hours')::interval
       RETURNING action_id`,
      [retentionHours],
    );
    return { expired: result.rowCount ?? 0 };
  }
}
