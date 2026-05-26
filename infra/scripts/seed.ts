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
/**
 * Demo broker credentials are intentionally for *local development only*. We
 * keep the literals here (rather than env-required) because seeding the demo
 * dataset is itself a dev-only operation — it's gated by the dev compose stack
 * and the lp_owner DB role, which prod must not expose. If you want to use
 * this script to bootstrap a real environment, override via the env vars
 * below; otherwise these defaults are fine.
 */
const API_KEY_SECRET = process.env.DEMO_API_KEY_SECRET ?? 'demo_secret_for_local_only';
const DEMO_EMAIL = process.env.DEMO_BROKER_EMAIL ?? 'demo@broker.local';
const DEMO_PASSWORD = process.env.DEMO_BROKER_PASSWORD ?? 'demo_password_change_me';

const SUPER_ADMIN_EMAIL = process.env.ADMIN_SEED_EMAIL ?? 'admin@lp.local';
/**
 * Super-admin password is REQUIRED from the environment. We refuse to seed
 * with a hard-coded value because the only way that defaults can be hard-coded
 * is if it's a placeholder — and a placeholder in production is equivalent to
 * having no admin auth at all. Operator must supply ADMIN_SEED_PASSWORD with a
 * value of ≥12 characters at seed time, then change it on first login.
 */
const SUPER_ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD;
if (!SUPER_ADMIN_PASSWORD || SUPER_ADMIN_PASSWORD.length < 12) {
  throw new Error(
    'ADMIN_SEED_PASSWORD env var is required (≥12 chars). ' +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(18).toString('base64url'))\"",
  );
}

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

    // Trades / charges / orders are NOT seeded. The dashboard reflects whatever
    // the broker has actually pushed via POST /api/v1/broker/orders. An empty
    // table renders as zero KPIs in the UI — that is the intended state for a
    // fresh install or a not-yet-wired broker.
    //
    // To restore the old demo dataset, replace this comment with the original
    // order + 100-trade + charges block (still available in git history).
    if (false) {
      const orderId = ulid();
      let prevHash = GENESIS_HASH;
      for (let i = 0; i < 100; i++) {
        const tradeId = ulid();
        const executedAt = new Date(Date.UTC(2026, 0, 1, 9, 15, 0) + i * 60_000);
        const quantity = '1';
        const price = new Money('2500')
          .add(new Money('0.05').mul(String(i)))
          .round(2)
          .toString();
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

        // Seed per-trade Indian-equity charges (illustrative rates, not authoritative).
        const turnover = new Money(quantity).mul(price);
        const brokerage = turnover.mul('0.0003').round(4); // 0.03 %
        const stt = turnover.mul('0.001').round(4); // 0.1 % on BUY (delivery)
        const exch = turnover.mul('0.0000325').round(4); // NSE 0.00325 %
        const sebi = turnover.mul('0.000001').round(4); // 0.0001 %
        const stamp = turnover.mul('0.00015').round(4); // 0.015 %
        const gst = brokerage.add(exch).add(sebi).mul('0.18').round(4); // 18 % on (brokerage + exch + sebi)
        const chargeRows: [string, string, string][] = [
          ['BROKERAGE', brokerage.toString(), 'Flat 0.03% brokerage'],
          ['STT', stt.toString(), 'Securities Transaction Tax (delivery)'],
          ['EXCHANGE_FEE', exch.toString(), 'NSE turnover charge'],
          ['SEBI_FEE', sebi.toString(), 'SEBI turnover fee'],
          ['STAMP_DUTY', stamp.toString(), 'Stamp duty (state)'],
          ['GST', gst.toString(), 'GST @ 18% on (brokerage + exch + sebi)'],
        ];
        for (const [type, amount, desc] of chargeRows) {
          await client.query(
            `INSERT INTO trading.charges (trade_id, type, amount, description)
             VALUES ($1, $2::charge_type, $3, $4)`,
            [tradeId, type, amount, desc],
          );
        }
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
