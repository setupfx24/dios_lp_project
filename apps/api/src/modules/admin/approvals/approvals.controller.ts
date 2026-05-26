import { Body, Controller, Get, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole, RequireReauth } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { ReauthGuard } from '../common/reauth.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

import { PendingActionsRepository } from './pending-actions.repository.js';

const decisionSchema = z.object({
  comment: z.string().min(1).max(500).optional(),
  reason: z.string().min(1).max(500).optional(),
});

@ApiTags('admin/approvals')
@Controller('api/v1/admin/approvals')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard, ReauthGuard)
@RequireAdminRole('super_admin', 'ops')
export class ApprovalsController {
  constructor(private readonly repo: PendingActionsRepository) {}

  @Get('pending')
  list() {
    return this.repo.listPending();
  }

  @Get(':actionId')
  async detail(@Param('actionId') actionId: string) {
    const row = await this.repo.findById(actionId);
    if (!row) {
      throw new DomainException(
        ErrorCode.NOT_FOUND,
        'Pending action not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return row;
  }

  @Post(':actionId/approve')
  @RequireReauth()
  @AuditLog({
    action: 'approval.approve',
    resourceType: 'pending_action',
    resourceIdParam: 'actionId',
  })
  async approve(
    @Param('actionId') actionId: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);

    const before = await this.repo.findById(actionId);
    if (!before) {
      throw new DomainException(
        ErrorCode.NOT_FOUND,
        'Pending action not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (before.requestedBy === ctx.user.userId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Self-approval forbidden',
        HttpStatus.FORBIDDEN,
      );
    }

    const updated = await this.repo.approve(actionId, ctx.user.userId, body.comment ?? null, tx);
    if (!updated) {
      throw new DomainException(
        ErrorCode.CONFLICT,
        'Action no longer pending (already approved/rejected/expired)',
        HttpStatus.CONFLICT,
      );
    }

    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: { status: before.status },
      afterState: { status: updated.status, approvedBy: updated.approvedBy },
    };
    return updated;
  }

  @Post(':actionId/reject')
  @RequireReauth()
  @AuditLog({
    action: 'approval.reject',
    resourceType: 'pending_action',
    resourceIdParam: 'actionId',
  })
  async reject(
    @Param('actionId') actionId: string,
    @Body(new ZodValidationPipe(decisionSchema)) body: z.infer<typeof decisionSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    if (!body.reason) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'reason is required when rejecting',
        HttpStatus.BAD_REQUEST,
      );
    }
    const tx = requireTx(ctx);
    const before = await this.repo.findById(actionId);
    if (!before) {
      throw new DomainException(
        ErrorCode.NOT_FOUND,
        'Pending action not found',
        HttpStatus.NOT_FOUND,
      );
    }
    if (before.requestedBy === ctx.user.userId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Self-rejection forbidden',
        HttpStatus.FORBIDDEN,
      );
    }
    const updated = await this.repo.reject(actionId, ctx.user.userId, body.reason, tx);
    if (!updated) {
      throw new DomainException(
        ErrorCode.CONFLICT,
        'Action no longer pending',
        HttpStatus.CONFLICT,
      );
    }
    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: { status: before.status },
      afterState: { status: updated.status, rejectionReason: updated.rejectionReason },
    };
    return updated;
  }
}
