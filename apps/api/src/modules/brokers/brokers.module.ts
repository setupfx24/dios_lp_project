import { Global, Module } from '@nestjs/common';

import { BrokersRepository } from './brokers.repository.js';

@Global()
@Module({
  providers: [BrokersRepository],
  exports: [BrokersRepository],
})
export class BrokersModule {}
