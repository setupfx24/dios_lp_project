import { Global, Module } from '@nestjs/common';

import { BrokersRepository } from './brokers.repository.js';

// Global so HmacGuard (used in OrdersModule via @UseGuards) can resolve
// BrokersRepository — module re-exports are not transitive across the
// HmacModule -> OrdersModule boundary.
@Global()
@Module({
  providers: [BrokersRepository],
  exports: [BrokersRepository],
})
export class BrokersModule {}
