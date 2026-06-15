import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { OrdersModule } from '../orders/orders.module.js';

import { BrokerPortalController } from './broker-portal.controller.js';

/**
 * Read-only broker-portal surface (account / wallet / ledger / orders).
 * BrokersRepository comes from the @Global BrokersModule.
 */
@Module({
  imports: [AuthModule, LedgerModule, OrdersModule],
  controllers: [BrokerPortalController],
})
export class BrokerPortalModule {}
