import { sql } from 'drizzle-orm';
import { bigint, index, numeric, pgEnum, text, timestamp } from 'drizzle-orm/pg-core';

import { trading } from '../../../database/schemas.js';
import { brokers } from '../../brokers/schema/broker.schema.js';

export const orderSideEnum = pgEnum('order_side', ['BUY', 'SELL']);
export const orderTypeEnum = pgEnum('order_type', ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT']);
export const timeInForceEnum = pgEnum('time_in_force', ['DAY', 'IOC', 'FOK', 'GTC']);
export const orderStatusEnum = pgEnum('order_status', [
  'PENDING',
  'ACCEPTED',
  'PARTIALLY_FILLED',
  'FILLED',
  'REJECTED',
  'CANCELLED',
]);

export const orders = trading.table(
  'orders',
  {
    id: bigint('id', { mode: 'bigint' }).generatedAlwaysAsIdentity().primaryKey(),
    orderId: text('order_id').notNull().unique(),
    clientOrderId: text('client_order_id').notNull(),
    brokerId: text('broker_id')
      .notNull()
      .references(() => brokers.brokerId, { onDelete: 'restrict' }),
    symbol: text('symbol').notNull(),
    side: orderSideEnum('side').notNull(),
    type: orderTypeEnum('type').notNull(),
    quantity: numeric('quantity', { precision: 20, scale: 4 }).notNull(),
    price: numeric('price', { precision: 20, scale: 4 }),
    timeInForce: timeInForceEnum('time_in_force').notNull(),
    status: orderStatusEnum('status').notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    // Optional end-user label from the upstream broker (e.g. dios sends the
    // DIOS user's name) so the broker portal can show who placed each trade.
    clientUserLabel: text('client_user_label'),
    // Optional end-user id from the upstream broker (dios sends the DIOS user's
    // _id) so the portals can show a stable identifier per trading user.
    clientUserId: text('client_user_id'),
    // Commission charged to the user (upstream broker sends it); recorded as a
    // BROKERAGE charge on the resulting trade so it shows in the Charges column.
    commissionAmount: numeric('commission_amount', { precision: 20, scale: 4 }),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    idxBrokerReceived: index('idx_orders_broker_received').on(t.brokerId, t.receivedAt),
    idxStatus: index('idx_orders_status').on(t.status),
    idxBrokerClientId: index('idx_orders_broker_clientid').on(t.brokerId, t.clientOrderId),
  }),
);

export type OrderRow = typeof orders.$inferSelect;
export type NewOrderRow = typeof orders.$inferInsert;
