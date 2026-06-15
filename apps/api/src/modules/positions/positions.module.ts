import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { HmacModule } from '../hmac/hmac.module.js';

import { PositionsController } from './positions.controller.js';

/**
 * Live open-position blotter. HMAC ingress (upstream broker marks) +
 * JWT read (broker dashboard initial snapshot). Redis publisher/client come
 * from the @Global RedisModule.
 */
@Module({
  imports: [AuthModule, HmacModule],
  controllers: [PositionsController],
})
export class PositionsModule {}
