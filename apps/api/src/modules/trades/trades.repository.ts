import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import { trades, type NewTradeRow, type TradeRow } from './schema/trade.schema.js';

import type { TradeListQuery } from '@lp/validators';

/**
 * APPEND-ONLY. This class intentionally exposes no `update` or `delete`.
 * Even if a future contributor needs to "fix" a trade, they must insert a
 * reversal row. See [README.md](./README.md).
 */
@Injectable()
export class TradesRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async insert(row: NewTradeRow, tx?: Db): Promise<TradeRow> {
    const exec = tx ?? this.db;
    const result = await exec.insert(trades).values(row).returning();
    const inserted = result[0];
    if (!inserted) {
      throw new Error('TradesRepository.insert: insert returned no rows');
    }
    return inserted;
  }

  async findById(tradeId: string): Promise<TradeRow | null> {
    const rows = await this.db.select().from(trades).where(eq(trades.tradeId, tradeId)).limit(1);
    return rows[0] ?? null;
  }

  async findByBroker(query: TradeListQuery & { brokerId: string }): Promise<TradeRow[]> {
    const conditions = [eq(trades.brokerId, query.brokerId)];
    if (query.symbol) {
      conditions.push(eq(trades.symbol, query.symbol));
    }
    if (query.side) {
      conditions.push(eq(trades.side, query.side as 'BUY' | 'SELL'));
    }
    if (query.from) {
      conditions.push(gte(trades.executedAt, new Date(query.from)));
    }
    if (query.to) {
      conditions.push(lt(trades.executedAt, new Date(query.to)));
    }
    if (query.cursor) {
      conditions.push(lte(trades.id, BigInt(query.cursor)));
    }

    return this.db
      .select()
      .from(trades)
      .where(and(...conditions))
      .orderBy(desc(trades.id))
      .limit(query.limit);
  }

  async getLastHash(brokerId: string, tx?: Db): Promise<string | null> {
    const exec = tx ?? this.db;
    const rows = await exec
      .select({ hash: trades.hash })
      .from(trades)
      .where(eq(trades.brokerId, brokerId))
      .orderBy(desc(trades.id))
      .limit(1);
    return rows[0]?.hash ?? null;
  }

  /**
   * Walk every trade for a broker in chain order. Returned in the order they
   * must be hashed (insertion order = ascending id).
   */
  async streamForVerification(brokerId: string): Promise<TradeRow[]> {
    return this.db
      .select()
      .from(trades)
      .where(eq(trades.brokerId, brokerId))
      .orderBy(asc(trades.id));
  }

  async countAll(): Promise<number> {
    const rows = await this.db.select({ c: sql<string>`count(*)::text` }).from(trades);
    return Number(rows[0]?.c ?? '0');
  }

  async statsForBroker(brokerId: string): Promise<{
    totalTrades: number;
    totalTurnover: string;
    totalQuantity: string;
    distinctSymbols: number;
    lastExecutedAt: string | null;
  }> {
    const rows = await this.db
      .select({
        totalTrades: sql<string>`count(*)::text`,
        totalTurnover: sql<string>`coalesce(sum(quantity * price), 0)::text`,
        totalQuantity: sql<string>`coalesce(sum(quantity), 0)::text`,
        distinctSymbols: sql<string>`count(distinct symbol)::text`,
        lastExecutedAt: sql<string | null>`to_char(max(executed_at), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
      })
      .from(trades)
      .where(eq(trades.brokerId, brokerId));
    const r = rows[0];
    return {
      totalTrades: Number(r?.totalTrades ?? '0'),
      totalTurnover: r?.totalTurnover ?? '0',
      totalQuantity: r?.totalQuantity ?? '0',
      distinctSymbols: Number(r?.distinctSymbols ?? '0'),
      lastExecutedAt: r?.lastExecutedAt ?? null,
    };
  }
}
