import { Inject, Injectable } from '@nestjs/common';

import { GENESIS_HASH, Money, computeHash, ulid } from '@lp/utils';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';
import { ChargesRepository } from '../charges/charges.repository.js';
import { ChargesService, type ChargeLine } from '../charges/charges.service.js';

import { TradesRepository } from './trades.repository.js';

import type { TradeRow } from './schema/trade.schema.js';
import type { ProductSegment } from '@lp/constants';

export interface RecordTradeInput {
  readonly orderId: string;
  readonly brokerId: string;
  readonly symbol: string;
  readonly side: 'BUY' | 'SELL';
  readonly quantity: string;
  readonly price: string;
  readonly executedAt: Date;
  readonly segment: ProductSegment;
}

export interface RecordedTrade {
  readonly trade: TradeRow;
  readonly charges: readonly ChargeLine[];
  readonly totalCharges: string;
}

@Injectable()
export class TradesService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly trades: TradesRepository,
    private readonly chargesRepo: ChargesRepository,
    private readonly chargesSvc: ChargesService,
  ) {}

  /**
   * Record a fill: hash-chain it, insert into trades, compute & insert
   * charges, all atomically. Concurrent inserts for the same broker
   * serialize through a row-level lock on the prior trade — but here we use
   * SERIALIZABLE isolation to keep the chain monotonic without lock games.
   */
  async recordTrade(input: RecordTradeInput): Promise<RecordedTrade> {
    return this.db.transaction(
      async (tx) => {
        const tradeId = ulid(input.executedAt.getTime());
        const prevHash = (await this.trades.getLastHash(input.brokerId, tx)) ?? GENESIS_HASH;

        // Canonical record fields are exactly what crosses the wire / chain.
        // executedAt is normalized to ISO so hash is stable across timezones.
        const canonical = {
          tradeId,
          orderId: input.orderId,
          brokerId: input.brokerId,
          symbol: input.symbol,
          side: input.side,
          quantity: new Money(input.quantity).toString(),
          price: new Money(input.price).toString(),
          executedAt: input.executedAt.toISOString(),
          prevHash,
        };
        const hash = computeHash(canonical, prevHash);

        const trade = await this.trades.insert(
          {
            tradeId,
            orderId: input.orderId,
            brokerId: input.brokerId,
            symbol: input.symbol,
            side: input.side,
            quantity: canonical.quantity,
            price: canonical.price,
            executedAt: input.executedAt,
            prevHash,
            hash,
          },
          tx,
        );

        const lines = this.chargesSvc.computeForFill({
          tradeId,
          side: input.side,
          quantity: input.quantity,
          price: input.price,
          executedAt: input.executedAt,
          segment: input.segment,
        });

        await this.chargesRepo.insertMany(
          lines.map((l) => ({
            tradeId: l.tradeId,
            type: l.type,
            amount: l.amount,
            description: l.description,
          })),
          tx,
        );

        return {
          trade,
          charges: lines,
          totalCharges: this.chargesSvc.totalFor(lines).round(2).toString(),
        };
      },
      { isolationLevel: 'serializable' },
    );
  }
}
