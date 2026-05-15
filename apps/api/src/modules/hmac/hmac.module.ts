import { Module } from '@nestjs/common';

import { BrokersModule } from '../brokers/brokers.module.js';

import { HmacGuard } from './hmac.guard.js';

@Module({
  imports: [BrokersModule],
  providers: [HmacGuard],
  exports: [HmacGuard],
})
export class HmacModule {}
