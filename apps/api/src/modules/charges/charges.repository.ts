import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

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
}
