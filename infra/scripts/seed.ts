/**
 * Idempotent seed script. Creates a demo broker with HMAC API keys, a demo
 * dashboard user, an order, and 100 hash-chained trades.
 *
 * Usage:
 *   pnpm tsx infra/scripts/seed.ts
 *
 * Env: DATABASE_URL must point at lp_owner credentials (DDL is not done here,
 * but the rows we INSERT pre-date the role-restricted runtime user).
 */
import * as argon2 from 'argon2';
import pg from 'pg';

import { GENESIS_HASH, computeHash } from '../../packages/utils/dist/hash-chain.js';
import { ulid } from '../../packages/utils/dist/id.js';
import { Money } from '../../packages/utils/dist/money.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const BROKER_ID = 'demo-broker-1';
const API_KEY_PREFIX = 'lp_demo';
const API_KEY_SECRET = 'demo_secret_for_local_only';
const DEMO_EMAIL = 'demo@broker.local';
const DEMO_PASSWORD = 'demo_password_change_me';

const SUPER_ADMIN_EMAIL = 'admin@lp.local';
const SUPER_ADMIN_PASSWORD = 'CHANGE_ME_super_admin_password_minimum_12';

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Broker
    await client.query(
      `INSERT INTO auth.brokers (broker_id, display_name, contact_email)
       VALUES ($1, $2, $3) ON CONFLICT (broker_id) DO NOTHING`,
      [BROKER_ID, 'Demo Broker', 'ops@demo-broker.local'],
    );

    // API key (hash the secret with argon2; the broker would store the plaintext)
    const secretHash = await argon2.hash(API_KEY_SECRET);
    await client.query(
      `INSERT INTO auth.api_keys (api_key_id, broker_id, label, key_prefix, secret_hash)
       VALUES ($1, $2, 'demo-key', $3, $4)
       ON CONFLICT (api_key_id) DO NOTHING`,
      [ulid(), BROKER_ID, API_KEY_PREFIX, secretHash],
    );

    // Dashboard user
    const passwordHash = await argon2.hash(DEMO_PASSWORD);
    await client.query(
      `INSERT INTO auth.users (user_id, email, password_hash, display_name, role, user_type, broker_id)
       VALUES ($1, $2, $3, $4, $5, 'broker_user', $6)
       ON CONFLICT (email) DO NOTHING`,
      [ulid(), DEMO_EMAIL, passwordHash, 'Demo User', 'broker_user', BROKER_ID],
    );

    // Super admin (no 2FA — will be forced on first login)
    const adminPasswordHash = await argon2.hash(SUPER_ADMIN_PASSWORD);
    await client.query(
      `INSERT INTO auth.users
         (user_id, email, password_hash, display_name, role, user_type, admin_role, must_change_password)
       VALUES ($1, $2, $3, $4, 'lp_admin', 'admin_user', 'super_admin', true)
       ON CONFLICT (email) DO NOTHING`,
      [ulid(), SUPER_ADMIN_EMAIL, adminPasswordHash, 'Super Admin'],
    );

    // Order (the trades reference it via FK)
    const orderId = ulid();
    await client.query(
      `INSERT INTO trading.orders
       (order_id, client_order_id, broker_id, symbol, side, type, quantity, price, time_in_force, status)
       VALUES ($1, $2, $3, 'RELIANCE', 'BUY', 'LIMIT', '100', '2500', 'DAY', 'FILLED')
       ON CONFLICT DO NOTHING`,
      [orderId, 'demo-c1', BROKER_ID],
    );

    // 100 chained trades — only seed if none exist for this broker
    const existing = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM trading.trades WHERE broker_id = $1`,
      [BROKER_ID],
    );
    if ((existing.rows[0]?.count ?? '0') === '0') {
      let prevHash = GENESIS_HASH;
      for (let i = 0; i < 100; i++) {
        const tradeId = ulid();
        const executedAt = new Date(Date.UTC(2026, 0, 1, 9, 15, 0) + i * 60_000);
        const quantity = '1';
        const price = new Money(2500 + i * 0.05).round(2).toString();
        const canonical = {
          tradeId,
          orderId,
          brokerId: BROKER_ID,
          symbol: 'RELIANCE',
          side: 'BUY',
          quantity,
          price,
          executedAt: executedAt.toISOString(),
          prevHash,
        };
        const hash = computeHash(canonical, prevHash);
        await client.query(
          `INSERT INTO trading.trades
           (trade_id, order_id, broker_id, symbol, side, quantity, price, executed_at, prev_hash, hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tradeId,
            orderId,
            BROKER_ID,
            'RELIANCE',
            'BUY',
            quantity,
            price,
            executedAt,
            prevHash,
            hash,
          ],
        );
        prevHash = hash;
      }
    }

    await client.query('COMMIT');

    console.warn('========================================');
    console.warn(' Demo broker seeded.');
    console.warn(`  brokerId : ${BROKER_ID}`);
    console.warn(`  api key  : ${API_KEY_PREFIX}.${API_KEY_SECRET}`);
    console.warn(`  user     : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
    console.warn('----------------------------------------');
    console.warn(' SUPER ADMIN — CHANGE IMMEDIATELY.');
    console.warn(' 2FA WILL BE FORCED ON FIRST LOGIN.');
    console.warn(`  email    : ${SUPER_ADMIN_EMAIL}`);
    console.warn(`  password : ${SUPER_ADMIN_PASSWORD}`);
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
    console.error('seed: FAILED', err);
    process.exitCode = 1;
    void pool.end();
  });
