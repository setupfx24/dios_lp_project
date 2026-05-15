import { Controller, Get, HttpStatus, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { brokers } from '../../brokers/schema/broker.schema.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole, RequireReauth } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { ReauthGuard } from '../common/reauth.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

@ApiTags('admin/brokers')
@Controller('api/v1/admin/brokers')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard, ReauthGuard)
@RequireAdminRole('super_admin', 'ops', 'support', 'read_only')
export class BrokersAdminController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  @Get()
  list() {
    return this.db.select().from(brokers);
  }

  @Get(':brokerId')
  async detail(@Param('brokerId') brokerId: string) {
    const rows = await this.db
      .select()
      .from(brokers)
      .where(eq(brokers.brokerId, brokerId))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  @Post(':brokerId/suspend')
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'broker.suspend', resourceType: 'broker', resourceIdParam: 'brokerId' })
  async suspend(@Param('brokerId') brokerId: string, @AdminCtx() ctx: AdminRequestContext) {
    const tx = requireTx(ctx);
    const before = (
      await tx.select().from(brokers).where(eq(brokers.brokerId, brokerId)).limit(1)
    )[0];
    if (!before) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    const [updated] = await tx
      .update(brokers)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(brokers.brokerId, brokerId))
      .returning();
    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: { status: before.status },
      afterState: { status: updated?.status },
    };
    return updated;
  }

  @Post(':brokerId/reactivate')
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'broker.reactivate', resourceType: 'broker', resourceIdParam: 'brokerId' })
  async reactivate(@Param('brokerId') brokerId: string, @AdminCtx() ctx: AdminRequestContext) {
    const tx = requireTx(ctx);
    const before = (
      await tx.select().from(brokers).where(eq(brokers.brokerId, brokerId)).limit(1)
    )[0];
    if (!before) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    const [updated] = await tx
      .update(brokers)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(brokers.brokerId, brokerId))
      .returning();
    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: { status: before.status },
      afterState: { status: updated?.status },
    };
    return updated;
  }
}
