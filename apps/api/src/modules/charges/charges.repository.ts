import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';
import { trades } from '../trades/schema/trade.schema.js';

import { charges, type ChargeRow, type NewChargeRow } from './schema/charge.schema.js';

@Injectable()
export class ChargesRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async insertMany(rows: readonly NewChargeRow[], tx?: Db): Promise<void> {
    if (rows.length === 0) {
      return;
    }
    const exec = tx ?? this.db;
    await exec.insert(charges).values([...rows]);
  }

  async findByTrade(tradeId: string): Promise<ChargeRow[]> {
    return this.db.select().from(charges).where(eq(charges.tradeId, tradeId));
  }

  async findByTrades(tradeIds: readonly string[]): Promise<ChargeRow[]> {
    if (tradeIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(charges)
      .where(inArray(charges.tradeId, [...tradeIds]));
  }

  /** Aggregate charges for a broker: total amount + count, plus per-type breakdown. */
  async statsForBroker(brokerId: string): Promise<{
    totalAmount: string;
    count: number;
    byType: { type: string; amount: string; count: number }[];
  }> {
    const totalRow = await this.db
      .select({
        total: sql<string>`coalesce(sum(${charges.amount}), 0)::text`,
        count: sql<string>`count(*)::text`,
      })
      .from(charges)
      .innerJoin(trades, eq(charges.tradeId, trades.tradeId))
      .where(eq(trades.brokerId, brokerId));

    const byTypeRows = await this.db
      .select({
        type: charges.type,
        amount: sql<string>`coalesce(sum(${charges.amount}), 0)::text`,
        count: sql<string>`count(*)::text`,
      })
      .from(charges)
      .innerJoin(trades, eq(charges.tradeId, trades.tradeId))
      .where(eq(trades.brokerId, brokerId))
      .groupBy(charges.type);

    return {
      totalAmount: totalRow[0]?.total ?? '0',
      count: Number(totalRow[0]?.count ?? '0'),
      byType: byTypeRows.map((r) => ({
        type: r.type,
        amount: r.amount,
        count: Number(r.count),
      })),
    };
  }
}
