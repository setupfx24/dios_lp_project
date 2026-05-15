import { GENESIS_HASH, computeHash } from '@lp/utils/hash-chain';

import type { AppLogger } from '../logger.js';
import type pg from 'pg';

interface TradeRow {
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

export interface ChainVerificationReport {
  brokersChecked: number;
  tradesChecked: number;
  brokensFound: ChainBreak[];
}

export interface ChainBreak {
  brokerId: string;
  tradeId: string;
  reason: 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH';
  expected: string;
  actual: string;
}

export class ChainVerifier {
  constructor(
    private readonly pool: pg.Pool,
    private readonly logger: AppLogger,
  ) {}

  async runForAllBrokers(): Promise<ChainVerificationReport> {
    const brokers = (
      await this.pool.query<{ broker_id: string }>(`SELECT DISTINCT broker_id FROM trading.trades`)
    ).rows.map((r) => r.broker_id);

    const breaks: ChainBreak[] = [];
    let total = 0;
    for (const brokerId of brokers) {
      const sub = await this.runForBroker(brokerId);
      breaks.push(...sub.breaks);
      total += sub.checked;
    }
    return { brokersChecked: brokers.length, tradesChecked: total, brokensFound: breaks };
  }

  async runForBroker(brokerId: string): Promise<{ checked: number; breaks: ChainBreak[] }> {
    const rows = (
      await this.pool.query<TradeRow>(
        `SELECT id, trade_id, order_id, broker_id, symbol, side,
                quantity::text AS quantity, price::text AS price,
                executed_at, prev_hash, hash
         FROM trading.trades
         WHERE broker_id = $1
         ORDER BY id ASC`,
        [brokerId],
      )
    ).rows;

    const breaks: ChainBreak[] = [];
    let expectedPrev = GENESIS_HASH;
    for (const row of rows) {
      if (row.prev_hash !== expectedPrev) {
        breaks.push({
          brokerId,
          tradeId: row.trade_id,
          reason: 'PREV_HASH_MISMATCH',
          expected: expectedPrev,
          actual: row.prev_hash,
        });
        // After a chain break we still keep checking starting from the row's
        // own claimed hash so we surface every break in one pass.
        expectedPrev = row.hash;
        continue;
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
        breaks.push({
          brokerId,
          tradeId: row.trade_id,
          reason: 'HASH_MISMATCH',
          expected: recomputed,
          actual: row.hash,
        });
      }
      expectedPrev = row.hash;
    }

    if (breaks.length === 0) {
      this.logger.info({ brokerId, checked: rows.length }, 'chain-verifier: ok');
    } else {
      this.logger.error(
        { brokerId, checked: rows.length, breaks: breaks.length },
        'chain-verifier: integrity violation detected',
      );
    }
    return { checked: rows.length, breaks };
  }
}
