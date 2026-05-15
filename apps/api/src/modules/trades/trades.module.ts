import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ChargesModule } from '../charges/charges.module.js';

import { TradesController } from './trades.controller.js';
import { TradesRepository } from './trades.repository.js';
import { TradesService } from './trades.service.js';

@Module({
  imports: [AuthModule, ChargesModule],
  controllers: [TradesController],
  providers: [TradesRepository, TradesService],
  exports: [TradesRepository, TradesService],
})
export class TradesModule {}
