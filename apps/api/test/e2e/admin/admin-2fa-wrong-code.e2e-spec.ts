import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, parseBody, seedAdmin } from '../../helpers/fixtures.js';

/**
 * 8.1.2 — 2FA verify with a wrong code is rejected.
 *
 * Pre-condition: admin already has TOTP configured. Submit "000000" or any
 * code that's not the current valid TOTP — endpoint returns 401 and the
 * session is NOT marked as totp-verified.
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

describe('admin 2FA — wrong code', () => {
  it('rejects an invalid TOTP code with 401 and leaves the session unverified', async () => {
    const seeded = await seedAdmin(h.db.pool, {
      withTotp: true,
      totpEncryptionKey: process.env.TOTP_ENCRYPTION_KEY!,
    });

    // Login → status=totp_required.
    const loginRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: seeded.email, password: seeded.password },
    });
    expect(loginRes.statusCode).toBe(201);
    expect(parseBody<{ status: string }>(loginRes.body).data.status).toBe('totp_required');
    const cookie = extractCookie(loginRes.headers['set-cookie'], 'lp_admin_access');
    expect(cookie).toBeTruthy();

    // Submit a knowingly-wrong code.
    const verifyRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa/verify',
      headers: { cookie: `lp_admin_access=${cookie!}` },
      payload: { code: '000000' },
    });
    expect(verifyRes.statusCode).toBe(401);
    const body = JSON.parse(verifyRes.body) as { success: boolean; error: { code: string } };
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('AUTH_INVALID_CREDENTIALS');

    // Session row must NOT have totp_verified_at set.
    const sessions = await h.db.pool.query<{ totp_verified_at: Date | null }>(
      `SELECT totp_verified_at FROM auth.admin_sessions WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
      [seeded.userId],
    );
    expect(sessions.rows[0]?.totp_verified_at).toBeNull();

    // A subsequent admin call still fails because TOTP is unverified.
    const followUp = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { cookie: `lp_admin_access=${cookie!}` },
    });
    expect(followUp.statusCode).toBe(403);
  });
});
