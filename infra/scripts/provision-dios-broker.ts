/**
 * One-shot provisioner: registers DIOS as a broker in the new LP and issues
 * an HMAC API key that DIOS will use to authenticate its REST + WebSocket
 * traffic.
 *
 * Idempotent — re-runs leave existing rows in place and skip re-issuing if a
 * key already exists for the broker (use --rotate to force a new key).
 *
 *   DATABASE_URL=postgres://lp_owner:owner_pw@localhost:5433/lp \
 *   pnpm tsx infra/scripts/provision-dios-broker.ts
 *
 * Output: the plaintext API key (prefix.secret) — copy into DIOS .env as
 * NEW_LP_API_KEY (this is the ONLY time the plaintext is visible; the
 * server stores only the Argon2 hash).
 */
import { randomBytes } from 'node:crypto';

import * as argon2 from 'argon2';
import pg from 'pg';

import { ulid } from '../../packages/utils/dist/id.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required (use lp_owner credentials for DDL-free inserts).');
}

const BROKER_ID = process.env.DIOS_BROKER_ID ?? 'dios-broker-1';
const DISPLAY_NAME = process.env.DIOS_BROKER_NAME ?? 'DIOS Broker';
const CONTACT_EMAIL = process.env.DIOS_BROKER_EMAIL ?? 'ops@diosderivative.com';
const KEY_LABEL = process.env.DIOS_KEY_LABEL ?? 'dios-primary';
const ROTATE = process.argv.includes('--rotate');

const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO auth.brokers (broker_id, display_name, contact_email, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (broker_id) DO UPDATE
         SET display_name = EXCLUDED.display_name,
             contact_email = EXCLUDED.contact_email,
             updated_at = now()`,
      [BROKER_ID, DISPLAY_NAME, CONTACT_EMAIL],
    );

    if (!ROTATE) {
      const existing = await client.query<{ key_prefix: string }>(
        `SELECT key_prefix FROM auth.api_keys
         WHERE broker_id = $1 AND revoked_at IS NULL
         LIMIT 1`,
        [BROKER_ID],
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        console.warn('========================================');
        console.warn(' DIOS broker already provisioned.');
        console.warn(`  brokerId    : ${BROKER_ID}`);
        console.warn(`  key prefix  : ${existing.rows[0]?.key_prefix}`);
        console.warn(' (plaintext secret was only printed on first issue;');
        console.warn('  pass --rotate to revoke and re-issue.)');
        console.warn('========================================');
        return;
      }
    } else {
      await client.query(
        `UPDATE auth.api_keys SET revoked_at = now()
         WHERE broker_id = $1 AND revoked_at IS NULL`,
        [BROKER_ID],
      );
    }

    // 8-char hex prefix is enough to look up uniquely; 32 bytes of secret
    // entropy is the actual auth factor.
    const prefix = `lp_${randomBytes(4).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const apiKeyId = ulid();
    const secretHash = await argon2.hash(secret);

    await client.query(
      `INSERT INTO auth.api_keys (api_key_id, broker_id, label, key_prefix, secret_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [apiKeyId, BROKER_ID, KEY_LABEL, prefix, secretHash],
    );

    await client.query('COMMIT');

    const plaintext = `${prefix}.${secret}`;
    console.warn('========================================');
    console.warn(' DIOS broker provisioned in new LP.');
    console.warn(`  brokerId    : ${BROKER_ID}`);
    console.warn(`  api key id  : ${apiKeyId}`);
    console.warn(`  label       : ${KEY_LABEL}`);
    console.warn('');
    console.warn(' --- COPY INTO DIOS .env (one time only) ---');
    console.warn(`  NEW_LP_API_KEY=${plaintext}`);
    console.warn('  ----------------------------------------');
    console.warn('');
    console.warn(' Secret is stored as Argon2 hash; this is the');
    console.warn(' ONLY time the plaintext appears. Lose it = rotate.');
    console.warn('========================================');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    console.error('provision: FAILED', err);
    process.exitCode = 1;
    void pool.end();
  });
