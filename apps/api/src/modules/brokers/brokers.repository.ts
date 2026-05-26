import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';

import { DRIZZLE_DB, type Db } from '../../database/connection.js';

import {
  apiKeys,
  brokers,
  type ApiKeyRow,
  type BrokerRow,
  type NewApiKeyRow,
  type NewBrokerRow,
} from './schema/broker.schema.js';

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

  /**
   * Admin-issuance helpers. `db` is optional so callers in an audit-tx
   * interceptor pass the transactional client to keep create + audit-log
   * atomic.
   */
  async insertBroker(row: NewBrokerRow, tx?: Db): Promise<BrokerRow> {
    const exec = tx ?? this.db;
    const [inserted] = await exec.insert(brokers).values(row).returning();
    if (!inserted) {
      throw new Error('BrokersRepository.insertBroker: insert returned no rows');
    }
    return inserted;
  }

  async insertApiKey(row: NewApiKeyRow, tx?: Db): Promise<ApiKeyRow> {
    const exec = tx ?? this.db;
    const [inserted] = await exec.insert(apiKeys).values(row).returning();
    if (!inserted) {
      throw new Error('BrokersRepository.insertApiKey: insert returned no rows');
    }
    return inserted;
  }

  async listApiKeysForBroker(brokerId: string): Promise<ApiKeyRow[]> {
    return this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.brokerId, brokerId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async findApiKey(apiKeyId: string): Promise<ApiKeyRow | null> {
    const rows = await this.db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.apiKeyId, apiKeyId))
      .limit(1);
    return rows[0] ?? null;
  }

  async revokeApiKey(apiKeyId: string, tx?: Db): Promise<ApiKeyRow | null> {
    const exec = tx ?? this.db;
    const [updated] = await exec
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.apiKeyId, apiKeyId), isNull(apiKeys.revokedAt)))
      .returning();
    return updated ?? null;
  }
}
