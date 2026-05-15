import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

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
}
