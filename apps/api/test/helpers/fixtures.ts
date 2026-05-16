import * as argon2 from 'argon2';
import { authenticator } from 'otplib';

import { encrypt } from '@lp/utils/encryption';
import { ulid } from '@lp/utils/id';

import type pg from 'pg';

/**
 * Seed a super_admin (or other-role admin) with optional pre-configured TOTP.
 * Returns the credentials and helper closures so tests can drive the auth
 * flow without recomputing values.
 */
export interface SeededAdmin {
  userId: string;
  email: string;
  password: string;
  /** When `withTotp` is true, the secret used to generate TOTP codes. */
  totpSecret: string | null;
  generateCode: () => string;
}

export interface SeedAdminOptions {
  email?: string;
  password?: string;
  adminRole?: 'super_admin' | 'ops' | 'support' | 'read_only';
  /** Pre-configure a verified TOTP so the user can skip the setup wizard. */
  withTotp?: boolean;
  totpEncryptionKey?: string;
}

export async function seedAdmin(pool: pg.Pool, opts: SeedAdminOptions = {}): Promise<SeededAdmin> {
  const email = opts.email ?? `admin-${ulid().toLowerCase()}@test.local`;
  const password = opts.password ?? 'CHANGE_ME_admin_password_min_12chars';
  const adminRole = opts.adminRole ?? 'super_admin';
  const userId = ulid();
  const passwordHash = await argon2.hash(password);

  let totpSecret: string | null = null;
  let totpSecretEnc: string | null = null;
  let totpVerifiedAt: Date | null = null;

  if (opts.withTotp) {
    if (!opts.totpEncryptionKey) {
      throw new Error('seedAdmin: withTotp=true requires totpEncryptionKey');
    }
    totpSecret = authenticator.generateSecret();
    totpSecretEnc = encrypt(totpSecret, opts.totpEncryptionKey);
    totpVerifiedAt = new Date();
  }

  await pool.query(
    `INSERT INTO auth.users
       (user_id, email, password_hash, display_name, role, user_type, admin_role,
        totp_secret_enc, totp_verified_at, must_change_password)
     VALUES ($1, $2, $3, $4, 'lp_admin', 'admin_user', $5, $6, $7, false)
     ON CONFLICT (email) DO NOTHING`,
    [userId, email, passwordHash, 'Test Admin', adminRole, totpSecretEnc, totpVerifiedAt],
  );

  return {
    userId,
    email,
    password,
    totpSecret,
    generateCode: () => {
      if (!totpSecret) {
        throw new Error('seedAdmin: cannot generate code, user seeded without TOTP');
      }
      return authenticator.generate(totpSecret);
    },
  };
}

/** Seed a broker user (for broker-side cookie isolation tests). */
export async function seedBrokerUser(
  pool: pg.Pool,
  opts: { email?: string; password?: string; brokerId?: string } = {},
): Promise<{
  userId: string;
  email: string;
  password: string;
  brokerId: string;
}> {
  const brokerId = opts.brokerId ?? `broker-${ulid().toLowerCase()}`;
  const email = opts.email ?? `broker-${ulid().toLowerCase()}@test.local`;
  const password = opts.password ?? 'broker_test_password_min_8';
  const userId = ulid();
  const passwordHash = await argon2.hash(password);

  await pool.query(
    `INSERT INTO auth.brokers (broker_id, display_name, contact_email)
     VALUES ($1, 'Test Broker', 'ops@test.local')
     ON CONFLICT (broker_id) DO NOTHING`,
    [brokerId],
  );
  await pool.query(
    `INSERT INTO auth.users
       (user_id, email, password_hash, display_name, role, user_type, broker_id)
     VALUES ($1, $2, $3, 'Test Broker User', 'broker_user', 'broker_user', $4)
     ON CONFLICT (email) DO NOTHING`,
    [userId, email, passwordHash, brokerId],
  );
  return { userId, email, password, brokerId };
}

export async function seedBroker(
  pool: pg.Pool,
  brokerId = `broker-${ulid().toLowerCase()}`,
): Promise<string> {
  await pool.query(
    `INSERT INTO auth.brokers (broker_id, display_name, contact_email)
     VALUES ($1, 'Test Broker', 'ops@test.local')
     ON CONFLICT (broker_id) DO NOTHING`,
    [brokerId],
  );
  return brokerId;
}

/**
 * Parse a Fastify inject response body and assert it as the success envelope.
 * Tests hitting error paths should call JSON.parse directly.
 */
export function parseBody<T>(body: string): { success: true; data: T; requestId: string } {
  return JSON.parse(body) as { success: true; data: T; requestId: string };
}

/** Extract Set-Cookie value for a named cookie from a Fastify inject result. */
export function extractCookie(
  rawHeader: string | string[] | undefined,
  name: string,
): string | null {
  if (!rawHeader) {
    return null;
  }
  const headers = Array.isArray(rawHeader) ? rawHeader : [rawHeader];
  for (const h of headers) {
    const match = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(h);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}
