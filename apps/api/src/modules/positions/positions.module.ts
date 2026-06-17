import { Module } from '@nestjs/common';

import { HmacModule } from '../hmac/hmac.module.js';

import { PositionsController } from './positions.controller.js';

/**
 * Broker live-positions feed (mark-to-market). RedisModule is @Global, so the
 * publisher/client are injected without importing it here; HmacModule provides
 * the guard that authenticates the upstream broker's signed push.
 */
@Module({
  imports: [HmacModule],
  controllers: [PositionsController],
})
export class PositionsModule {}
