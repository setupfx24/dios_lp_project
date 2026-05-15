import { Module } from '@nestjs/common';

import { RiskService } from './risk.service.js';

@Module({
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
