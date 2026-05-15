import { Module } from '@nestjs/common';

import { ChargesRepository } from './charges.repository.js';
import { ChargesService } from './charges.service.js';

@Module({
  providers: [ChargesService, ChargesRepository],
  exports: [ChargesService, ChargesRepository],
})
export class ChargesModule {}
