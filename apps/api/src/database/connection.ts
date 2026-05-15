import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import * as schema from './schema/index.js';

export type DatabaseSchema = typeof schema;
export type Db = NodePgDatabase<DatabaseSchema>;

export interface ConnectionOptions {
  readonly databaseUrl: string;
  readonly poolMax?: number;
  readonly logger?: boolean;
}

export function createPool(opts: ConnectionOptions): pg.Pool {
  return new pg.Pool({
    connectionString: opts.databaseUrl,
    max: opts.poolMax ?? 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
  });
}

export function createDb(pool: pg.Pool, opts: { logger?: boolean } = {}): Db {
  return drizzle(pool, { schema, logger: opts.logger ?? false });
}

export const DRIZZLE_DB = Symbol('DRIZZLE_DB');
export const PG_POOL = Symbol('PG_POOL');
