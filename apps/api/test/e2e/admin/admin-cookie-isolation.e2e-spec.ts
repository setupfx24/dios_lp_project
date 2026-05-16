import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startE2EApp, stopE2EApp, type E2EAppHandle } from '../../helpers/e2e-app.js';
import { extractCookie, seedBrokerUser } from '../../helpers/fixtures.js';

/**
 * 8.1.9 — Broker JWT cookie (`lp_access`) sent to `/api/v1/admin/*` is rejected.
 *
 * Cross-trust-domain enforcement:
 *   - broker JWT signed with JWT_SECRET; admin verifier uses ADMIN_JWT_SECRET
 *   - cookie names differ (`lp_access` vs `lp_admin_access`)
 *
 * We verify three forms of attempted misuse:
 *   (a) Sending the broker cookie under the broker name to an admin endpoint
 *       — AdminJwtGuard looks for `lp_admin_access`, not finding it, rejects.
 *   (b) Renaming the broker cookie to `lp_admin_access` — AdminJwtGuard reads
 *       the token but verifyAsync fails (different signing secret), rejects.
 *   (c) Authorization header with broker token — same result, signature
 *       cannot be verified against ADMIN_JWT_SECRET.
 */

let h: E2EAppHandle;
let brokerCookie: string;
let brokerToken: string;

beforeAll(async () => {
  h = await startE2EApp();

  const user = await seedBrokerUser(h.db.pool);
  const loginRes = await h.app.inject({
    method: 'POST',
    url: '/api/v1/broker/auth/login',
    payload: { email: user.email, password: user.password },
  });
  expect(loginRes.statusCode).toBe(201);
  brokerCookie = extractCookie(loginRes.headers['set-cookie'], 'lp_access')!;
  expect(brokerCookie).toBeTruthy();
  brokerToken = brokerCookie;
}, 180_000);

afterAll(async () => {
  if (h) {
    await stopE2EApp(h);
  }
}, 60_000);

describe('admin cookie isolation', () => {
  it('(a) broker cookie sent as-is → admin endpoint rejects (no admin cookie present)', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { cookie: `lp_access=${brokerCookie}` },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toMatch(/AUTH_TOKEN_INVALID|AUTH_TOKEN_EXPIRED/);
  });

  it('(b) broker token renamed to admin cookie → JWT verify fails (different secret)', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { cookie: `lp_admin_access=${brokerToken}` },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('AUTH_TOKEN_EXPIRED');
  });

  it('(c) broker token in X-Admin-Authorization header → JWT verify fails', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/api/v1/admin/operations/metrics',
      headers: { 'x-admin-authorization': `Bearer ${brokerToken}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
