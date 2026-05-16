import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, parseBody, seedAdmin, seedBroker } from '../../helpers/fixtures.js';

type SeededAdmin = Awaited<ReturnType<typeof seedAdmin>>;

/**
 * 8.1.3 — Audit row is written in the SAME transaction as the state change.
 *
 * Positive: a successful below-threshold wallet adjust produces a ledger
 * entry AND a corresponding audit row, both visible after commit.
 *
 * Negative (atomicity): if the audit insert fails, the action rolls back —
 * verified by introducing a CHECK constraint that rejects the specific
 * audit row we expect, then confirming no ledger row landed either.
 */

let h: E2EAppHandle;

beforeAll(async () => {
  h = await startE2EApp();
}, 180_000);

afterAll(async () => {
  if (h) {
    await stopE2EApp(h);
  }
}, 60_000);

async function loginAndVerify(seeded: SeededAdmin) {
  const loginRes = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: { email: seeded.email, password: seeded.password },
  });
  const cookie = extractCookie(loginRes.headers['set-cookie'], 'lp_admin_access')!;
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/2fa/verify',
    headers: { cookie: `lp_admin_access=${cookie}` },
    payload: { code: seeded.generateCode() },
  });
  const reauthRes = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/reauth',
    headers: { cookie: `lp_admin_access=${cookie}` },
    payload: { password: seeded.password },
  });
  const reauthToken = parseBody<{ reauthToken: string }>(reauthRes.body).data.reauthToken;
  return { cookie, reauthToken };
}

describe('admin audit-in-tx', () => {
  it('writes audit + ledger entries together on a successful wallet adjust', async () => {
    const brokerId = await seedBroker(h.db.pool);
    const seeded = await seedAdmin(h.db.pool, {
      withTotp: true,
      totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
    });
    const { cookie, reauthToken } = await loginAndVerify(seeded);

    const before = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    expect(before.rows[0]!.count).toBe('0');

    const adjustRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/interventions/wallet-adjust',
      headers: {
        cookie: `lp_admin_access=${cookie}`,
        'x-reauth-token': reauthToken,
      },
      payload: {
        brokerId,
        direction: 'CREDIT',
        amount: '50',
        reason: 'unit test below threshold',
      },
    });
    expect(adjustRes.statusCode).toBe(201);

    // Two ledger entries (debit + credit pair) AND one audit row.
    const ledgerCount = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    expect(ledgerCount.rows[0]!.count).toBe('2');

    const audit = await h.db.pool.query<{
      action: string;
      outcome: string;
      metadata: { afterState?: { status?: string } } | null;
    }>(
      `SELECT action, outcome, metadata
       FROM audit.audit_logs
       WHERE actor_id = $1 AND action = 'wallet.adjust'
       ORDER BY id DESC LIMIT 1`,
      [seeded.userId],
    );
    expect(audit.rows[0]!.outcome).toBe('success');
    expect(audit.rows[0]!.metadata?.afterState?.status).toBe('executed');
  });

  it('rolls back the action when the audit insert fails (atomicity)', async () => {
    const brokerId = await seedBroker(h.db.pool);
    const seeded = await seedAdmin(h.db.pool, {
      withTotp: true,
      totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
    });
    const { cookie, reauthToken } = await loginAndVerify(seeded);

    // Install a temporary CHECK constraint that ANY audit row for this specific
    // user + action combo will fail. This simulates "audit insert fails" without
    // mocking — the same code path that would catch a real DB error.
    // ULIDs are [0-9A-HJKMNP-TV-Z]{26}, safe to inline as a SQL literal.
    if (!/^[0-9A-HJKMNP-TV-Z]{26}$/.test(seeded.userId)) {
      throw new Error('test invariant broken: ulid format unexpected');
    }
    await h.db.pool.query(
      `ALTER TABLE audit.audit_logs
         ADD CONSTRAINT chk_test_block_audit_for_user
         CHECK (NOT (actor_id = '${seeded.userId}' AND action = 'wallet.adjust'))`,
    );

    try {
      const ledgerBefore = await h.db.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
      );
      const ledgerBeforeCount = Number(ledgerBefore.rows[0]!.count);

      const adjustRes = await h.app.inject({
        method: 'POST',
        url: '/api/v1/admin/interventions/wallet-adjust',
        headers: {
          cookie: `lp_admin_access=${cookie}`,
          'x-reauth-token': reauthToken,
        },
        payload: {
          brokerId,
          direction: 'CREDIT',
          amount: '50',
          reason: 'should roll back because audit fails',
        },
      });
      // The request fails because the audit insert breaks the tx.
      expect(adjustRes.statusCode).toBeGreaterThanOrEqual(500);

      // The ledger MUST be unchanged.
      const ledgerAfter = await h.db.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
      );
      expect(Number(ledgerAfter.rows[0]!.count)).toBe(ledgerBeforeCount);

      // No audit row for this user+action (constraint blocked the only attempt).
      const audit = await h.db.pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM audit.audit_logs
         WHERE actor_id = $1 AND action = 'wallet.adjust'`,
        [seeded.userId],
      );
      expect(audit.rows[0]!.count).toBe('0');
    } finally {
      await h.db.pool.query(
        `ALTER TABLE audit.audit_logs DROP CONSTRAINT chk_test_block_audit_for_user`,
      );
    }
  });
});
