import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, seedAdmin } from '../../helpers/fixtures.js';

/**
 * 8.1.8 — Admin session idle > 15 minutes → next request rejected.
 *
 * Rather than wait 15 minutes, we backdate `last_activity_at` in the DB
 * so the guard sees an expired session on the next call. Verifies:
 *  - the request is rejected (401)
 *  - the session is REVOKED so even un-backdating doesn't recover it
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

describe('admin idle timeout', () => {
  it('rejects a request when last_activity_at is older than the configured window', async () => {
    const admin = await seedAdmin(h.db.pool, {
      withTotp: true,
      totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
    });

    const loginRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: admin.email, password: admin.password },
    });
    const cookie = extractCookie(loginRes.headers['set-cookie'], 'lp_admin_access')!;
    await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa/verify',
      headers: { cookie: `lp_admin_access=${cookie}` },
      payload: { code: admin.generateCode() },
    });

    // Sanity: a normal call succeeds right after 2FA.
    const ok = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { cookie: `lp_admin_access=${cookie}` },
    });
    expect(ok.statusCode).toBe(200);

    // Backdate the session's last_activity_at to 20 minutes ago.
    await h.db.pool.query(
      `UPDATE auth.admin_sessions
         SET last_activity_at = now() - interval '20 minutes'
       WHERE user_id = $1`,
      [admin.userId],
    );

    const stale = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { cookie: `lp_admin_access=${cookie}` },
    });
    expect(stale.statusCode).toBe(401);

    // Session should have been revoked by the guard.
    const session = await h.db.pool.query<{ revoked_at: Date | null }>(
      `SELECT revoked_at FROM auth.admin_sessions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [admin.userId],
    );
    expect(session.rows[0]!.revoked_at).not.toBeNull();

    // Even if we un-backdate now, the revoked_at means the session stays dead.
    await h.db.pool.query(
      `UPDATE auth.admin_sessions SET last_activity_at = now() WHERE user_id = $1`,
      [admin.userId],
    );
    const stillDead = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { cookie: `lp_admin_access=${cookie}` },
    });
    expect(stillDead.statusCode).toBe(401);
  });
});
