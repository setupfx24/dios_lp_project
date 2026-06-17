import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';

import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { REDIS_CLIENT } from '../../../infrastructure/redis.module.js';
import { TradesRepository } from '../../trades/trades.repository.js';
import { RequireAdminRole } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

interface DashboardBroker {
  brokerId: string;
  displayName: string;
  contactEmail: string;
  status: string;
  balance: string;
}

@ApiTags('admin/operations')
@Controller('api/v1/admin/operations')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard)
@RequireAdminRole('super_admin', 'ops', 'support', 'read_only')
export class OperationsController {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly trades: TradesRepository,
  ) {}

  /** Aggregate KPIs for the admin dashboard (brokers, balance, PnL, commission). */
  @Get('dashboard')
  async dashboard(): Promise<{
    brokersCount: number;
    totalBalance: string;
    totalPnl: string;
    totalCommission: string;
    recentBrokers: DashboardBroker[];
  }> {
    const rows = <T>(r: unknown): T[] => (r as { rows?: T[] }).rows ?? [];
    const signed = sql`COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END), 0)::text`;

    const [bc] = rows<{ c: number }>(
      await this.db.execute(sql`SELECT count(*)::int AS c FROM auth.brokers`),
    );
    const [bal] = rows<{ v: string }>(
      await this.db.execute(sql`SELECT ${signed} AS v FROM ledger.ledger_entries`),
    );
    const [pnl] = rows<{ v: string }>(
      await this.db.execute(
        sql`SELECT ${signed} AS v FROM ledger.ledger_entries WHERE reference_type = 'TRADE'`,
      ),
    );
    const [comm] = rows<{ v: string }>(
      await this.db.execute(sql`SELECT COALESCE(SUM(amount), 0)::text AS v FROM trading.charges`),
    );
    const recent = rows<{
      broker_id: string;
      display_name: string;
      contact_email: string;
      status: string;
      balance: string;
    }>(
      await this.db.execute(sql`
        SELECT b.broker_id, b.display_name, b.contact_email, b.status,
          COALESCE((
            SELECT SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)
            FROM ledger.ledger_entries le
            JOIN ledger.wallets w ON w.wallet_id = le.wallet_id
            WHERE w.broker_id = b.broker_id
          ), 0)::text AS balance
        FROM auth.brokers b
        ORDER BY b.created_at DESC
        LIMIT 10`),
    );

    return {
      brokersCount: bc?.c ?? 0,
      totalBalance: bal?.v ?? '0',
      totalPnl: pnl?.v ?? '0',
      totalCommission: comm?.v ?? '0',
      recentBrokers: recent.map((r) => ({
        brokerId: r.broker_id,
        displayName: r.display_name,
        contactEmail: r.contact_email,
        status: r.status,
        balance: r.balance,
      })),
    };
  }

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
