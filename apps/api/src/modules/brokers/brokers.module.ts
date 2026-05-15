import { Module } from '@nestjs/common';

import { BrokersRepository } from './brokers.repository.js';

@Module({
  providers: [BrokersRepository],
  exports: [BrokersRepository],
})
export class BrokersModule {}
