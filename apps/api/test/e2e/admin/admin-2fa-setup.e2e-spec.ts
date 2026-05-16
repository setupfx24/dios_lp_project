import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, parseBody, seedAdmin } from '../../helpers/fixtures.js';

/**
 * 8.1.1 — 2FA setup happy path.
 *
 * Flow:
 *   1. Login with password (no TOTP configured) → status=totp_setup_required
 *   2. POST /2fa/setup → returns secret + QR
 *   3. POST /2fa/verify-setup with first valid TOTP code → recovery codes returned
 *   4. Subsequent login → status=totp_required
 *   5. POST /2fa/verify with valid code → ok
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

describe('admin 2FA — setup happy path', () => {
  it('login → setup → verify-setup → recovery codes', async () => {
    const seeded = await seedAdmin(h.db.pool, {});

    // 1. Initial login: TOTP not yet configured.
    const loginRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: seeded.email, password: seeded.password },
    });
    expect(loginRes.statusCode).toBe(201);
    expect(parseBody<{ status: string }>(loginRes.body).data.status).toBe('totp_setup_required');

    const cookie = extractCookie(loginRes.headers['set-cookie'], 'lp_admin_access');
    expect(cookie).toBeTruthy();

    // 2. Begin TOTP setup.
    const setupRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa/setup',
      headers: { cookie: `lp_admin_access=${cookie!}` },
    });
    expect(setupRes.statusCode).toBe(201);
    const setupBody = parseBody<{
      secret: string;
      otpauthUrl: string;
      qrDataUrl: string;
    }>(setupRes.body).data;
    expect(setupBody.secret).toMatch(/^[A-Z2-7]+$/); // Base32
    expect(setupBody.qrDataUrl).toMatch(/^data:image\/png;base64,/);

    // 3. Finalize: present a valid code generated from the secret we just received.
    const firstCode = authenticator.generate(setupBody.secret);
    const verifySetupRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa/verify-setup',
      headers: { cookie: `lp_admin_access=${cookie!}` },
      payload: { code: firstCode },
    });
    expect(verifySetupRes.statusCode).toBe(201);
    const recoveryBody = parseBody<{ recoveryCodes: string[] }>(verifySetupRes.body).data;
    expect(recoveryBody.recoveryCodes).toHaveLength(10);
    for (const c of recoveryBody.recoveryCodes) {
      expect(c).toMatch(/^[0-9a-f]{16}$/);
    }

    // 4. Fresh login → now requires TOTP (no setup).
    const relogin = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/login',
      payload: { email: seeded.email, password: seeded.password },
    });
    expect(parseBody<{ status: string }>(relogin.body).data.status).toBe('totp_required');

    const reCookie = extractCookie(relogin.headers['set-cookie'], 'lp_admin_access');
    expect(reCookie).toBeTruthy();

    // 5. Submit a valid TOTP code for this session.
    const verifyRes = await h.app.inject({
      method: 'POST',
      url: '/api/v1/admin/auth/2fa/verify',
      headers: { cookie: `lp_admin_access=${reCookie!}` },
      payload: { code: authenticator.generate(setupBody.secret) },
    });
    expect(verifyRes.statusCode).toBe(201);
    expect(parseBody<{ ok: true }>(verifyRes.body).data).toEqual({ ok: true });
  });
});
