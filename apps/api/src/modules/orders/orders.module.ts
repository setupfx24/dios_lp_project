import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { HmacModule } from '../hmac/hmac.module.js';

import { OrdersController } from './orders.controller.js';
import { ORDERS_QUEUE } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';

@Module({
  imports: [HmacModule, BullModule.registerQueue({ name: ORDERS_QUEUE })],
  controllers: [OrdersController],
  providers: [OrdersRepository],
  exports: [OrdersRepository],
})
export class OrdersModule {}
