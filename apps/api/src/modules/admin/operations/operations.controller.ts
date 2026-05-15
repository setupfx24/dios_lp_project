import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../../infrastructure/redis.module.js';
import { TradesRepository } from '../../trades/trades.repository.js';
import { RequireAdminRole } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

@ApiTags('admin/operations')
@Controller('api/v1/admin/operations')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard)
@RequireAdminRole('super_admin', 'ops', 'support', 'read_only')
export class OperationsController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly trades: TradesRepository,
  ) {}

  @Get('metrics')
  async metrics(): Promise<{
    queueDepth: number;
    tradesTotal: number;
    timestamp: string;
  }> {
    const depth = await this.redis.llen('bull:orders:wait').catch(() => 0);
    const tradesTotal = await this.trades.countAll();
    return {
      queueDepth: depth,
      tradesTotal,
      timestamp: new Date().toISOString(),
    };
  }
}
