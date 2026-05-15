import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import { apiKeys, brokers, type ApiKeyRow, type BrokerRow } from './schema/broker.schema.js';

@Injectable()
export class BrokersRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  async findByApiKeyPrefix(prefix: string): Promise<{ broker: BrokerRow; key: ApiKeyRow } | null> {
    const rows = await this.db
      .select({
        broker: brokers,
        key: apiKeys,
      })
      .from(apiKeys)
      .innerJoin(brokers, eq(apiKeys.brokerId, brokers.brokerId))
      .where(and(eq(apiKeys.keyPrefix, prefix), isNull(apiKeys.revokedAt)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByBrokerId(brokerId: string): Promise<BrokerRow | null> {
    const rows = await this.db
      .select()
      .from(brokers)
      .where(eq(brokers.brokerId, brokerId))
      .limit(1);
    return rows[0] ?? null;
  }

  async touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
    await this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.apiKeyId, apiKeyId));
  }
}
