import * as argon2 from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ulid } from '@lp/utils/id';

import { ApprovalWatcher } from '../../src/processors/approval-watcher.js';
import { startTestDatabase, stopTestDatabase, type DbHandle } from '../helpers/db.js';

/**
 * 8.1.7 — Approved pending action is executed by the worker dispatcher.
 *
 * Setup: insert an `admin.pending_actions` row directly with
 * `status='approved'` (skipping the request → approve UI). Run one cycle
 * of `ApprovalWatcher.pollOnce`. Verify:
 *   - row transitions to `status='executed'` with `executed_at` set
 *   - ledger has the debit + credit pair from the @lp/core dispatcher
 *   - audit row records `pending.execute` with outcome='success' and the
 *     result payload, including the entry IDs
 */

let h: DbHandle;
let watcher: ApprovalWatcher;
let brokerId: string;
let requesterUserId: string;
let approverUserId: string;

const noopLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
};

async function seedUser(role: 'super_admin' | 'ops'): Promise<string> {
  const userId = ulid();
  const passwordHash = await argon2.hash('test_password_min_12chars');
  await h.pool.query(
    `INSERT INTO auth.users
       (user_id, email, password_hash, display_name, role, user_type, admin_role)
     VALUES ($1, $2, $3, 'Watcher Test', 'lp_admin', 'admin_user', $4)`,
    [userId, `${userId.toLowerCase()}@test.local`, passwordHash, role],
  );
  return userId;
}

beforeAll(async () => {
  h = await startTestDatabase();
  brokerId = `broker-${ulid().toLowerCase()}`;
  await h.pool.query(
    `INSERT INTO auth.brokers (broker_id, display_name, contact_email)
     VALUES ($1, 'WD Broker', 'ops@test.local')`,
    [brokerId],
  );
  requesterUserId = await seedUser('ops');
  approverUserId = await seedUser('super_admin');
  watcher = new ApprovalWatcher(h.pool, noopLogger);
}, 180_000);

afterAll(async () => {
  if (h) {
    await stopTestDatabase(h);
  }
}, 60_000);

describe('ApprovalWatcher (8.1.7)', () => {
  it('approved pending_action → executed via @lp/core; ledger + audit written', async () => {
    const actionId = ulid();
    const payload = {
      brokerId,
      direction: 'CREDIT' as const,
      amount: '12345',
      currency: 'INR',
      reason: 'worker dispatch test',
    };

    await h.pool.query(
      `INSERT INTO admin.pending_actions
         (action_id, action_type, payload, reason, requested_by,
          approved_by, approved_at, expires_at, status)
       VALUES ($1, 'wallet.adjust', $2::jsonb, $3, $4,
               $5, now(), now() + interval '1 day', 'approved')`,
      [actionId, JSON.stringify(payload), payload.reason, requesterUserId, approverUserId],
    );

    const ledgerBefore = await h.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    const baselineLedger = Number(ledgerBefore.rows[0]!.count);

    const result = await watcher.pollOnce();
    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const row = await h.pool.query<{ status: string; executed_at: Date | null }>(
      `SELECT status, executed_at FROM admin.pending_actions WHERE action_id = $1`,
      [actionId],
    );
    expect(row.rows[0]!.status).toBe('executed');
    expect(row.rows[0]!.executed_at).not.toBeNull();

    const ledgerAfter = await h.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    expect(Number(ledgerAfter.rows[0]!.count) - baselineLedger).toBe(2);

    const audit = await h.pool.query<{
      outcome: string;
      metadata: { type: string; approvedBy: string; result: { entryIds: string[] } } | null;
    }>(
      `SELECT outcome, metadata
       FROM audit.audit_logs
       WHERE action = 'pending.execute' AND resource_id = $1
       ORDER BY id DESC LIMIT 1`,
      [actionId],
    );
    expect(audit.rows[0]!.outcome).toBe('success');
    expect(audit.rows[0]!.metadata?.type).toBe('wallet.adjust');
    expect(audit.rows[0]!.metadata?.approvedBy).toBe(approverUserId);
    expect(audit.rows[0]!.metadata?.result.entryIds).toHaveLength(2);
  });

  it('subsequent pollOnce is a no-op (no rows in approved state)', async () => {
    const result = await watcher.pollOnce();
    expect(result.processed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('expireStale transitions long-pending rows to expired', async () => {
    const actionId = ulid();
    await h.pool.query(
      `INSERT INTO admin.pending_actions
         (action_id, action_type, payload, reason, requested_by,
          requested_at, expires_at, status)
       VALUES ($1, 'wallet.adjust', '{}'::jsonb, 'stale', $2,
               now() - interval '48 hours', now() - interval '1 hour', 'pending')`,
      [actionId, requesterUserId],
    );
    const { expired } = await watcher.expireStale(24);
    expect(expired).toBeGreaterThanOrEqual(1);
    const row = await h.pool.query<{ status: string }>(
      `SELECT status FROM admin.pending_actions WHERE action_id = $1`,
      [actionId],
    );
    expect(row.rows[0]!.status).toBe('expired');
  });
});
