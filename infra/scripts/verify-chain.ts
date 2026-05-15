/**
 * Standalone hash-chain integrity check. Usage:
 *
 *   pnpm tsx infra/scripts/verify-chain.ts            # all brokers
 *   pnpm tsx infra/scripts/verify-chain.ts <brokerId> # single broker
 *
 * Exits 0 on success, 1 on the first chain break. Used in CI nightly and
 * during incident triage.
 */
import pg from 'pg';

import { GENESIS_HASH, computeHash } from '../../packages/utils/dist/hash-chain.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const targetBroker = process.argv[2];
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });

interface Row {
  id: string;
  trade_id: string;
  order_id: string;
  broker_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  executed_at: Date;
  prev_hash: string;
  hash: string;
}

async function verifyForBroker(brokerId: string): Promise<{ checked: number; breaks: number }> {
  const rows = (
    await pool.query<Row>(
      `SELECT id, trade_id, order_id, broker_id, symbol, side,
              quantity::text AS quantity, price::text AS price,
              executed_at, prev_hash, hash
       FROM trading.trades
       WHERE broker_id = $1
       ORDER BY id ASC`,
      [brokerId],
    )
  ).rows;

  let breaks = 0;
  let expectedPrev = GENESIS_HASH;
  for (const row of rows) {
    if (row.prev_hash !== expectedPrev) {
      console.error(
        `[broker=${brokerId} trade=${row.trade_id}] PREV_HASH_MISMATCH: expected ${expectedPrev}, got ${row.prev_hash}`,
      );
      breaks++;
    }
    const recomputed = computeHash(
      {
        tradeId: row.trade_id,
        orderId: row.order_id,
        brokerId: row.broker_id,
        symbol: row.symbol,
        side: row.side,
        quantity: row.quantity,
        price: row.price,
        executedAt: row.executed_at.toISOString(),
        prevHash: row.prev_hash,
      },
      row.prev_hash,
    );
    if (recomputed !== row.hash) {
      console.error(
        `[broker=${brokerId} trade=${row.trade_id}] HASH_MISMATCH: expected ${recomputed}, got ${row.hash}`,
      );
      breaks++;
    }
    expectedPrev = row.hash;
  }
  return { checked: rows.length, breaks };
}

async function main(): Promise<void> {
  const brokers = targetBroker
    ? [targetBroker]
    : (
        await pool.query<{ broker_id: string }>(`SELECT DISTINCT broker_id FROM trading.trades`)
      ).rows.map((r) => r.broker_id);

  let totalChecked = 0;
  let totalBreaks = 0;
  for (const b of brokers) {
    const r = await verifyForBroker(b);
    totalChecked += r.checked;
    totalBreaks += r.breaks;
    console.warn(`[broker=${b}] checked=${r.checked} breaks=${r.breaks}`);
  }
  console.warn(`Total: brokers=${brokers.length} trades=${totalChecked} breaks=${totalBreaks}`);
  if (totalBreaks > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => pool.end())
  .catch((err: unknown) => {
    console.error('verify-chain: FAILED', err);
    process.exitCode = 1;
    void pool.end();
  });
