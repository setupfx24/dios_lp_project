import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { AppConfigModule, AppConfigService } from '../config/config.module.js';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');
export const REDIS_PUBLISHER = Symbol('REDIS_PUBLISHER');
export const REDIS_SUBSCRIBER = Symbol('REDIS_SUBSCRIBER');

function buildRedis(url: string): Redis {
  return new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => buildRedis(cfg.get('REDIS_URL')),
    },
    {
      provide: REDIS_PUBLISHER,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => buildRedis(cfg.get('REDIS_URL')),
    },
    {
      provide: REDIS_SUBSCRIBER,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => buildRedis(cfg.get('REDIS_URL')),
    },
  ],
  exports: [REDIS_CLIENT, REDIS_PUBLISHER, REDIS_SUBSCRIBER],
})
export class RedisModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await Promise.resolve();
  }
}
