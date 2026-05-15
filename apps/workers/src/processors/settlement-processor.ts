import type { AppLogger } from '../logger.js';
import type pg from 'pg';

/**
 * End-of-day settlement / ledger reconciliation. Reads each broker's open
 * positions, marks-to-market against last close, and records adjustment
 * ledger entries. Production wires up the price source; this scaffold
 * just logs the totals.
 */
export class SettlementProcessor {
  constructor(
    private readonly pool: pg.Pool,
    private readonly logger: AppLogger,
  ) {}

  async runEod(): Promise<{ brokersSettled: number; trades: number }> {
    const result = await this.pool.query<{ broker_id: string; count: string }>(
      `SELECT broker_id, count(*)::text AS count
       FROM trading.trades
       WHERE executed_at::date = current_date
       GROUP BY broker_id`,
    );
    let total = 0;
    for (const row of result.rows) {
      const count = Number(row.count);
      total += count;
      this.logger.info({ brokerId: row.broker_id, trades: count }, 'settlement: counted');
    }
    return { brokersSettled: result.rows.length, trades: total };
  }
}
