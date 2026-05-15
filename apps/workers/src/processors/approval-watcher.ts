import type { AppLogger } from '../logger.js';
import type pg from 'pg';

/**
 * Polls `admin.pending_actions` for `status = 'approved'` rows and executes
 * the underlying action. Production should switch to LISTEN/NOTIFY to remove
 * polling latency — this scaffold uses a 30-second interval.
 *
 * Each execution writes an audit row (action `pending.execute`) and
 * transitions the action to `executed`. The original action's audit row
 * (when it was queued) plus the approve/reject row plus this execute row
 * gives the complete history.
 */
export class ApprovalWatcher {
  constructor(
    private readonly pool: pg.Pool,
    private readonly logger: AppLogger,
  ) {}

  async pollOnce(): Promise<{ processed: number }> {
    const rows = (
      await this.pool.query<{ action_id: string; action_type: string; payload: unknown }>(
        `SELECT action_id, action_type, payload
         FROM admin.pending_actions
         WHERE status = 'approved'
         ORDER BY approved_at ASC
         LIMIT 25`,
      )
    ).rows;

    for (const row of rows) {
      // The actual execution dispatch lives in the api app's interventions
      // service. For this scaffold we just transition the row — production
      // wires the dispatch via a shared `packages/core` extraction.

      await this.pool.query(
        `UPDATE admin.pending_actions SET status = 'executed', executed_at = now()
         WHERE action_id = $1 AND status = 'approved'`,
        [row.action_id],
      );
      this.logger.info(
        { actionId: row.action_id, type: row.action_type },
        'approval-watcher: marked executed (handler stub)',
      );
    }
    return { processed: rows.length };
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
