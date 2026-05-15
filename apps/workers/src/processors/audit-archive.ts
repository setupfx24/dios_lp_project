import type { AppLogger } from '../logger.js';
import type { S3Driver } from '../storage/s3.js';
import type pg from 'pg';

/**
 * Reads audit log entries older than `retainDays` and uploads them in
 * day-batched JSON.gz files to S3 with object lock. Append-only — never
 * deletes from the audit table; the row stays in the DB for queryability.
 */
export class AuditArchiveProcessor {
  constructor(
    private readonly pool: pg.Pool,
    private readonly s3: S3Driver,
    private readonly logger: AppLogger,
    private readonly retainDays = 30,
  ) {}

  async run(): Promise<{ archivedRows: number }> {
    const cutoff = new Date(Date.now() - this.retainDays * 24 * 60 * 60 * 1000);
    const rows = (
      await this.pool.query<{
        audit_id: string;
        actor_type: string;
        actor_id: string;
        action: string;
        outcome: string;
        created_at: Date;
        metadata: unknown;
      }>(
        `SELECT audit_id, actor_type, actor_id, action, outcome, created_at, metadata
         FROM audit.audit_logs
         WHERE created_at < $1
         ORDER BY created_at ASC`,
        [cutoff],
      )
    ).rows;

    if (rows.length === 0) {
      this.logger.info('audit-archive: no eligible rows');
      return { archivedRows: 0 };
    }

    const key = `audit/${cutoff.toISOString().slice(0, 10)}/batch-${Date.now()}.json`;
    const body = JSON.stringify(rows);
    await this.s3.putWithObjectLock(key, body);
    this.logger.info({ rows: rows.length, key }, 'audit-archive: uploaded');
    return { archivedRows: rows.length };
  }
}
