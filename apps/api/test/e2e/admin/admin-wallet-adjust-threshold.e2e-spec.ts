import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, parseBody, seedAdmin, seedBroker } from '../../helpers/fixtures.js';

/**
 * 8.1.5 + 8.1.6 — Threshold routing for wallet adjustments.
 *
 * ADMIN_4EYES_THRESHOLD_PAISE in the test env is 1_000_000 paise = ₹10_000.
 *
 *   amount = ₹50    → below threshold → executes immediately
 *   amount = ₹50000 → above threshold → queued in admin.pending_actions
 */

let h: E2EAppHandle;
let cookie: string;
let reauthToken: string;
let brokerId: string;

beforeAll(async () => {
  h = await startE2EApp();
  brokerId = await seedBroker(h.db.pool);

  const admin = await seedAdmin(h.db.pool, {
    adminRole: 'ops',
    withTotp: true,
    totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
  });

  const loginRes = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/login',
    payload: { email: admin.email, password: admin.password },
  });
  cookie = extractCookie(loginRes.headers['set-cookie'], 'lp_admin_access')!;
  await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/2fa/verify',
    headers: { cookie: `lp_admin_access=${cookie}` },
    payload: { code: admin.generateCode() },
  });
  const reauth = await h.app.inject({
    method: 'POST',
    url: '/api/v1/admin/auth/reauth',
    headers: { cookie: `lp_admin_access=${cookie}` },
    payload: { password: admin.password },
  });
  reauthToken = parseBody<{ reauthToken: string }>(reauth.body).data.reauthToken;
}, 180_000);

afterAll(async () => {
  if (h) {
    await stopE2EApp(h);
  }
}, 60_000);

describe('admin wallet-adjust threshold routing', () => {
  it('below threshold → executes immediately, ledger has 2 entries', async () => {
    const before = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    const baseline = Number(before.rows[0]!.count);

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/interventions/wallet-adjust',
      headers: { cookie: `lp_admin_access=${cookie}`, 'x-reauth-token': reauthToken },
      payload: {
        brokerId,
        direction: 'CREDIT',
        amount: '50',
        reason: 'below threshold test',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = parseBody<{
      status: 'executed' | 'queued_for_approval';
      entryIds?: string[];
    }>(res.body).data;
    expect(body.status).toBe('executed');
    expect(body.entryIds).toHaveLength(2);

    const after = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    expect(Number(after.rows[0]!.count) - baseline).toBe(2);

    // No new pending_actions row.
    const pending = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin.pending_actions
       WHERE payload->>'brokerId' = $1 AND payload->>'amount' = '50'`,
      [brokerId],
    );
    expect(pending.rows[0]!.count).toBe('0');
  });

  it('above threshold → queued, no ledger change, pending_actions row created', async () => {
    const ledgerBefore = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    const baseline = Number(ledgerBefore.rows[0]!.count);

    const res = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/interventions/wallet-adjust',
      headers: { cookie: `lp_admin_access=${cookie}`, 'x-reauth-token': reauthToken },
      payload: {
        brokerId,
        direction: 'CREDIT',
        amount: '50000', // ₹50,000 — well above the ₹10,000 threshold
        reason: 'above threshold test — should queue',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = parseBody<{
      status: 'executed' | 'queued_for_approval';
      actionId?: string;
    }>(res.body).data;
    expect(body.status).toBe('queued_for_approval');
    expect(body.actionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    // Ledger unchanged.
    const ledgerAfter = await h.db.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ledger.ledger_entries`,
    );
    expect(Number(ledgerAfter.rows[0]!.count)).toBe(baseline);

    // pending_actions has the new row.
    const pending = await h.db.pool.query<{
      status: string;
      action_type: string;
      requested_by: string;
    }>(
      `SELECT status, action_type, requested_by
       FROM admin.pending_actions
       WHERE action_id = $1`,
      [body.actionId],
    );
    expect(pending.rows[0]!.status).toBe('pending');
    expect(pending.rows[0]!.action_type).toBe('wallet.adjust');
  });
});
