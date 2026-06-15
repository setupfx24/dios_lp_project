import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Redis } from 'ioredis';

import { REDIS_CLIENT } from '../../../infrastructure/redis.module.js';
import { TradesRepository } from '../../trades/trades.repository.js';
import { RequireAdminRole } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

import type { OpenPositionMark } from '@lp/types';

interface CachedSnapshot {
  readonly marks: readonly OpenPositionMark[];
  readonly totalUnrealizedPnl: string;
  readonly ts: number;
}

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

  /**
   * Live open-position blotter for one broker, read from the same Redis
   * snapshot the broker's own dashboard receives over websocket. Admin uses
   * a separate JWT realm, so it can't join the broker's socket room — it polls
   * this instead (the snapshot refreshes on every upstream mark-to-market tick).
   */
  @Get('positions')
  async positions(
    @Query('brokerId') brokerId?: string,
  ): Promise<CachedSnapshot & { brokerId: string }> {
    const id = (brokerId ?? '').trim();
    if (!id) {
      return { brokerId: '', marks: [], totalUnrealizedPnl: '0', ts: 0 };
    }
    const raw = await this.redis.get(`lp:positions:${id}`);
    if (!raw) {
      return { brokerId: id, marks: [], totalUnrealizedPnl: '0', ts: 0 };
    }
    const parsed = JSON.parse(raw) as CachedSnapshot;
    return { brokerId: id, ...parsed };
  }
}
