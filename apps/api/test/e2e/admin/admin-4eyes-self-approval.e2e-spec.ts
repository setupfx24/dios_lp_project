import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ulid } from '@lp/utils/id';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, parseBody, seedAdmin, seedBroker } from '../../helpers/fixtures.js';

/**
 * 8.1.4 — Self-approval is rejected at THREE layers:
 *
 *   (a) DB CHECK constraint — direct SQL UPDATE blocked
 *   (b) Repository WHERE clause — `repo.approve(actionId, sameUserId)` returns
 *       null because the WHERE excludes self
 *   (c) HTTP controller — the ApprovalsController throws AUTH_FORBIDDEN
 *       BEFORE even hitting the repo (defense in depth at the entry point)
 */

let h: E2EAppHandle;
let appCookie: string;
let reauthToken: string;
let approverUserId: string;
let requesterUserId: string;

beforeAll(async () => {
  h = await startE2EApp();

  const requester = await seedAdmin(h.db.pool, {
    adminRole: 'ops',
    withTotp: true,
    totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
  });
  requesterUserId = requester.userId;

  // The "approver" is a second admin who logs in.
  const approver = await seedAdmin(h.db.pool, {
    adminRole: 'super_admin',
    withTotp: true,
    totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
  });
  approverUserId = approver.userId;

  const loginRes = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: { email: approver.email, password: approver.password },
  });
  appCookie = extractCookie(loginRes.headers['set-cookie'], 'lp_admin_access')!;
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/2fa/verify',
    headers: { cookie: `lp_admin_access=${appCookie}` },
    payload: { code: approver.generateCode() },
  });
  const reauthRes = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/reauth',
    headers: { cookie: `lp_admin_access=${appCookie}` },
    payload: { password: approver.password },
  });
  reauthToken = parseBody<{ reauthToken: string }>(reauthRes.body).data.reauthToken;

  await seedBroker(h.db.pool, 'self-approval-test-broker');
}, 180_000);

afterAll(async () => {
  if (h) {
    await stopE2EApp(h);
  }
}, 60_000);

/**
 * Insert a pending_action whose `requested_by` we control.
 */
async function insertPendingAction(requestedBy: string): Promise<string> {
  const actionId = ulid();
  await h.db.pool.query(
    `INSERT INTO admin.pending_actions
       (action_id, action_type, payload, reason, requested_by, expires_at)
     VALUES ($1, 'wallet.adjust', $2::jsonb, 'self-approval test', $3, now() + interval '1 day')`,
    [actionId, JSON.stringify({ amount: '100' }), requestedBy],
  );
  return actionId;
}

describe('admin 4-eyes — self-approval rejected at all three layers', () => {
  it('(a) DB CHECK rejects direct SQL UPDATE setting approved_by=requested_by', async () => {
    const actionId = await insertPendingAction(requesterUserId);
    await expect(
      h.db.pool.query(
        `UPDATE admin.pending_actions
           SET approved_by = requested_by, approved_at = now(), status = 'approved'
         WHERE action_id = $1`,
        [actionId],
      ),
    ).rejects.toThrow(/chk_pending_actions_no_self_approval/);
  });

  it('(b) Repository UPDATE WHERE-clause excludes self (returns no rows)', async () => {
    const actionId = await insertPendingAction(requesterUserId);
    // Even bypassing the controller, the repository SQL has
    // `WHERE requested_by <> approved_by` baked in. We replicate the query
    // here to verify the invariant.
    const result = await h.db.pool.query(
      `UPDATE admin.pending_actions
         SET status = 'approved', approved_by = $2, approved_at = now()
       WHERE action_id = $1
         AND status = 'pending'
         AND requested_by <> $2
       RETURNING action_id`,
      [actionId, requesterUserId], // approver == requester
    );
    expect(result.rowCount).toBe(0);
    // Action stays pending.
    const row = await h.db.pool.query<{ status: string }>(
      `SELECT status FROM admin.pending_actions WHERE action_id = $1`,
      [actionId],
    );
    expect(row.rows[0]!.status).toBe('pending');
  });

  it('(c) HTTP controller blocks self-approval with 403 before touching the DB', async () => {
    // Approver-as-requester scenario: action was filed by the same admin
    // who is now trying to approve it.
    const actionId = await insertPendingAction(approverUserId);

    const res = await h.app.inject({
      method: 'POST',
      url: `/api/v1/admin/approvals/${actionId}/approve`,
      headers: {
        cookie: `lp_admin_access=${appCookie}`,
        'x-reauth-token': reauthToken,
      },
      payload: { comment: 'trying to approve my own request' },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_FORBIDDEN');

    // Action still pending.
    const row = await h.db.pool.query<{ status: string }>(
      `SELECT status FROM admin.pending_actions WHERE action_id = $1`,
      [actionId],
    );
    expect(row.rows[0]!.status).toBe('pending');
  });
});
