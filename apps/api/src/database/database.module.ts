import { Global, Module, type OnModuleDestroy } from '@nestjs/common';

import { AppConfigModule, AppConfigService } from '../config/config.module.js';

import { DRIZZLE_DB, PG_POOL, createDb, createPool, type Db } from './connection.js';

import type pg from 'pg';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService): pg.Pool =>
        createPool({
          databaseUrl: cfg.get('DATABASE_URL'),
          poolMax: cfg.get('DATABASE_POOL_MAX'),
        }),
    },
    {
      provide: DRIZZLE_DB,
      inject: [PG_POOL, AppConfigService],
      useFactory: (pool: pg.Pool, cfg: AppConfigService): Db =>
        createDb(pool, { logger: cfg.isDev }),
    },
  ],
  exports: [DRIZZLE_DB, PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  async onModuleDestroy(): Promise<void> {
    // The pool is closed by Nest's DI container when the app shuts down,
    // but we want to be explicit about waiting for in-flight queries.
    await Promise.resolve();
  }
}
