import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import { ulid } from '@lp/utils';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import { orders, type NewOrderRow, type OrderRow } from './schema/order.schema.js';

@Injectable()
export class OrdersRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async insert(
    input: Omit<NewOrderRow, 'orderId' | 'status' | 'receivedAt' | 'updatedAt'>,
  ): Promise<OrderRow> {
    const orderId = ulid();
    const inserted = await this.db
      .insert(orders)
      .values({ ...input, orderId, status: 'PENDING' })
      .returning();
    const row = inserted[0];
    if (!row) {
      throw new Error('OrdersRepository.insert: no rows returned');
    }
    return row;
  }

  async updateStatus(
    orderId: string,
    status: OrderRow['status'],
    rejectionReason?: string,
  ): Promise<void> {
    await this.db
      .update(orders)
      .set({ status, rejectionReason: rejectionReason ?? null, updatedAt: new Date() })
      .where(eq(orders.orderId, orderId));
  }

  async findById(orderId: string): Promise<OrderRow | null> {
    const rows = await this.db.select().from(orders).where(eq(orders.orderId, orderId)).limit(1);
    return rows[0] ?? null;
  }

  /** A broker's orders, newest first, optionally filtered by status. */
  async findByBroker(
    brokerId: string,
    opts: { limit?: number; status?: OrderRow['status'] } = {},
  ): Promise<OrderRow[]> {
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const where = opts.status
      ? and(eq(orders.brokerId, brokerId), eq(orders.status, opts.status))
      : eq(orders.brokerId, brokerId);
    return this.db.select().from(orders).where(where).orderBy(desc(orders.id)).limit(limit);
  }
}
