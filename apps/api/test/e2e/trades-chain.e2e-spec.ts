import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GENESIS_HASH, Money, computeHash, ulid } from '@lp/utils';

import * as schema from '../../src/database/schema/index.js';
import {
  appUserUrl,
  startTestDatabase,
  stopTestDatabase,
  type DbHandle,
} from '../helpers/testcontainers.js';

let dbh: DbHandle;
const BROKER_ID = 'broker-e2e-1';

beforeAll(async () => {
  dbh = await startTestDatabase();
  // Seed a broker so the FK on trades is satisfied.
  await dbh.pool.query(
    `INSERT INTO auth.brokers (broker_id, display_name, contact_email)
     VALUES ($1, 'E2E Broker', 'e2e@example.com')`,
    [BROKER_ID],
  );
});

afterAll(async () => {
  if (dbh) {
    await stopTestDatabase(dbh);
  }
}, 30_000);

describe('Trade hash chain (real Postgres)', () => {
  it('chains 5 trades with valid prev_hash links', async () => {
    const db = drizzle(dbh.pool, { schema });

    // Seed an order; orderId is FK target.
    const orderId = ulid();
    await dbh.pool.query(
      `INSERT INTO trading.orders
       (order_id, client_order_id, broker_id, symbol, side, type, quantity, price, time_in_force, status)
       VALUES ($1, 'c1', $2, 'AAA', 'BUY', 'LIMIT', '10', '100', 'DAY', 'ACCEPTED')`,
      [orderId, BROKER_ID],
    );

    let prevHash = GENESIS_HASH;
    for (let i = 0; i < 5; i++) {
      const tradeId = ulid();
      const executedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, i));
      const canonical = {
        tradeId,
        orderId,
        brokerId: BROKER_ID,
        symbol: 'AAA',
        side: 'BUY',
        quantity: new Money('1').toString(),
        price: new Money(100 + i).toString(),
        executedAt: executedAt.toISOString(),
        prevHash,
      };
      const hash = computeHash(canonical, prevHash);
      await db.insert(schema.trades).values({
        tradeId,
        orderId,
        brokerId: BROKER_ID,
        symbol: 'AAA',
        side: 'BUY',
        quantity: canonical.quantity,
        price: canonical.price,
        executedAt,
        prevHash,
        hash,
      });
      prevHash = hash;
    }

    const rows = (
      await dbh.pool.query(
        `SELECT prev_hash AS "prevHash", hash FROM trading.trades WHERE broker_id = $1 ORDER BY id`,
        [BROKER_ID],
      )
    ).rows as { prevHash: string; hash: string }[];

    expect(rows).toHaveLength(5);
    expect(rows[0]?.prevHash).toBe(GENESIS_HASH);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i]?.prevHash).toBe(rows[i - 1]?.hash);
    }
  });

  it('blocks UPDATE on trading.trades when connected as lp_app (trigger fires)', async () => {
    const appPool = new pg.Pool({ connectionString: appUserUrl(dbh), max: 1 });
    try {
      await expect(
        appPool.query(`UPDATE trading.trades SET price = '999' WHERE id > 0`),
      ).rejects.toThrow(/Append-only/);
    } finally {
      await appPool.end();
    }
  });

  it('blocks DELETE on trading.trades when connected as lp_app (trigger fires)', async () => {
    const appPool = new pg.Pool({ connectionString: appUserUrl(dbh), max: 1 });
    try {
      await expect(appPool.query(`DELETE FROM trading.trades WHERE id > 0`)).rejects.toThrow(
        /Append-only/,
      );
    } finally {
      await appPool.end();
    }
  });

  it('allows INSERT on trading.trades when connected as lp_app', async () => {
    const appPool = new pg.Pool({ connectionString: appUserUrl(dbh), max: 1 });
    try {
      // Should succeed (lp_app has SELECT/INSERT).
      const orderId = ulid();
      await dbh.pool.query(
        `INSERT INTO trading.orders
         (order_id, client_order_id, broker_id, symbol, side, type, quantity, price, time_in_force, status)
         VALUES ($1, 'c2', $2, 'AAA', 'BUY', 'LIMIT', '1', '100', 'DAY', 'ACCEPTED')`,
        [orderId, BROKER_ID],
      );
      const tradeId = ulid();
      const prevHashRows = (
        await dbh.pool.query<{ hash: string }>(
          `SELECT hash FROM trading.trades WHERE broker_id=$1 ORDER BY id DESC LIMIT 1`,
          [BROKER_ID],
        )
      ).rows;
      const prevHash = prevHashRows[0]?.hash ?? GENESIS_HASH;
      const canonical = {
        tradeId,
        orderId,
        brokerId: BROKER_ID,
        symbol: 'AAA',
        side: 'BUY',
        quantity: '1',
        price: '100',
        executedAt: new Date('2026-02-01T00:00:00Z').toISOString(),
        prevHash,
      };
      const hash = computeHash(canonical, prevHash);
      await expect(
        appPool.query(
          `INSERT INTO trading.trades
            (trade_id, order_id, broker_id, symbol, side, quantity, price, executed_at, prev_hash, hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            tradeId,
            orderId,
            BROKER_ID,
            'AAA',
            'BUY',
            '1',
            '100',
            '2026-02-01T00:00:00Z',
            prevHash,
            hash,
          ],
        ),
      ).resolves.toBeDefined();
    } finally {
      await appPool.end();
    }
  });
});
