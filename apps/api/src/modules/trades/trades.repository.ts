import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import { charges } from '../charges/schema/charge.schema.js';
import { orders } from '../orders/schema/order.schema.js';

import { trades, type NewTradeRow, type TradeRow } from './schema/trade.schema.js';

import type { TradeListQuery } from '@lp/validators';

/** A trade row enriched for the broker list: the originating order's
 *  clientOrderId (used to label OPEN vs CLOSE legs) + the summed charges. */
export interface TradeListItemRow extends TradeRow {
  clientOrderId: string | null;
  clientUserLabel: string | null;
  clientUserId: string | null;
  chargesTotal: string;
}

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

  async findByBroker(query: TradeListQuery & { brokerId: string }): Promise<TradeListItemRow[]> {
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
      .select({
        id: trades.id,
        tradeId: trades.tradeId,
        orderId: trades.orderId,
        brokerId: trades.brokerId,
        symbol: trades.symbol,
        side: trades.side,
        quantity: trades.quantity,
        price: trades.price,
        executedAt: trades.executedAt,
        prevHash: trades.prevHash,
        hash: trades.hash,
        createdAt: trades.createdAt,
        // clientOrderId from the originating order: DIOS sends the close leg as
        // "<tradeId>-C", so the UI labels it CLOSE; everything else is OPEN.
        clientOrderId: orders.clientOrderId,
        clientUserLabel: orders.clientUserLabel,
        clientUserId: orders.clientUserId,
        // Summed post-trade charges for this trade (0 when none yet).
        chargesTotal: sql<string>`COALESCE((SELECT SUM(${charges.amount}) FROM ${charges} WHERE ${charges.tradeId} = ${trades.tradeId}), 0)::text`,
      })
      .from(trades)
      .leftJoin(orders, eq(trades.orderId, orders.orderId))
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
}
