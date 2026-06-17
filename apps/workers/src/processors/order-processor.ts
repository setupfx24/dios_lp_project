import { GENESIS_HASH, computeHash } from '@lp/utils/hash-chain';
import { ulid } from '@lp/utils/id';
import { Money } from '@lp/utils/money';

import type { AppLogger } from '../logger.js';
import type { Redis } from 'ioredis';
import type pg from 'pg';

interface OrderRow {
  order_id: string;
  broker_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
  quantity: string;
  price: string | null;
  commission_amount: string | null;
  status: string;
}

export interface OrderJobData {
  orderId: string;
  brokerId: string;
}

const REFERENCE_PRICE_FALLBACK = '100';

export class OrderProcessor {
  constructor(
    private readonly pool: pg.Pool,
    private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  async process(job: OrderJobData): Promise<void> {
    const order = await this.loadOrder(job.orderId);
    if (!order) {
      this.logger.warn({ orderId: job.orderId }, 'order-processor: order not found');
      return;
    }
    if (order.status !== 'PENDING' && order.status !== 'ACCEPTED') {
      this.logger.info(
        { orderId: order.order_id, status: order.status },
        'order-processor: skipping (terminal status)',
      );
      return;
    }

    const referencePrice = order.price ?? REFERENCE_PRICE_FALLBACK;
    const fillPrice = order.type === 'MARKET' ? referencePrice : (order.price ?? referencePrice);

    // Validate the price parses cleanly (Money throws on garbage).
    void new Money(fillPrice);

    await this.recordFill(order, fillPrice);
    await this.markFilled(order.order_id);
    await this.publishTradeEvent(order, fillPrice);
  }

  private async loadOrder(orderId: string): Promise<OrderRow | null> {
    const rows = (
      await this.pool.query<OrderRow>(
        `SELECT order_id, broker_id, symbol, side, type,
                quantity::text AS quantity, price::text AS price,
                commission_amount::text AS commission_amount, status
         FROM trading.orders WHERE order_id = $1`,
        [orderId],
      )
    ).rows;
    return rows[0] ?? null;
  }

  private async recordFill(order: OrderRow, fillPrice: string): Promise<void> {
    const tradeId = ulid();
    const executedAt = new Date();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      const prev = await client.query<{ hash: string }>(
        `SELECT hash FROM trading.trades WHERE broker_id = $1 ORDER BY id DESC LIMIT 1`,
        [order.broker_id],
      );
      const prevHash = prev.rows[0]?.hash ?? GENESIS_HASH;

      const canonical = {
        tradeId,
        orderId: order.order_id,
        brokerId: order.broker_id,
        symbol: order.symbol,
        side: order.side,
        quantity: new Money(order.quantity).toString(),
        price: new Money(fillPrice).toString(),
        executedAt: executedAt.toISOString(),
        prevHash,
      };
      const hash = computeHash(canonical, prevHash);

      await client.query(
        `INSERT INTO trading.trades
         (trade_id, order_id, broker_id, symbol, side, quantity, price, executed_at, prev_hash, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          tradeId,
          order.order_id,
          order.broker_id,
          order.symbol,
          order.side,
          canonical.quantity,
          canonical.price,
          executedAt,
          prevHash,
          hash,
        ],
      );

      // Record the upstream broker's commission as a BROKERAGE charge so it
      // shows in the broker portal's Charges column. The trade price stays raw.
      const commission = order.commission_amount ? new Money(order.commission_amount) : null;
      if (commission && commission.isPositive()) {
        await client.query(
          `INSERT INTO trading.charges (trade_id, type, amount, description)
           VALUES ($1, 'BROKERAGE', $2, $3)`,
          [tradeId, commission.toString(), 'Broker commission'],
        );
      }

      await client.query('COMMIT');
      this.logger.info(
        { tradeId, orderId: order.order_id, brokerId: order.broker_id },
        'order-processor: trade recorded',
      );
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async markFilled(orderId: string): Promise<void> {
    await this.pool.query(
      `UPDATE trading.orders SET status = 'FILLED', updated_at = now() WHERE order_id = $1`,
      [orderId],
    );
  }

  private async publishTradeEvent(order: OrderRow, fillPrice: string): Promise<void> {
    await this.redis.publish(
      'lp.events',
      JSON.stringify({
        type: 'trade.executed',
        brokerId: order.broker_id,
        symbol: order.symbol,
        side: order.side,
        price: fillPrice,
        quantity: order.quantity,
        executedAt: new Date().toISOString(),
      }),
    );
  }
}
