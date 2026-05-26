import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';
import { executeWalletAdjust } from '@lp/core';
import { Money } from '@lp/utils/money';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { AppConfigService } from '../../../config/config.module.js';
import { drizzleLedgerOps } from '../../ledger/drizzle-ledger-ops.js';
import { LedgerRepository } from '../../ledger/ledger.repository.js';
import { PendingActionsRepository } from '../approvals/pending-actions.repository.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole, RequireReauth } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { ReauthGuard } from '../common/reauth.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

const walletAdjustSchema = z.object({
  brokerId: z.string().min(1),
  direction: z.enum(['DEBIT', 'CREDIT']),
  amount: z.string().regex(/^\d+(\.\d{1,4})?$/, 'positive decimal'),
  currency: z.string().default('INR'),
  reason: z.string().min(10).max(500),
});

@ApiTags('admin/interventions')
@Controller('api/v1/admin/interventions')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard, ReauthGuard)
@RequireAdminRole('super_admin', 'ops')
export class InterventionsController {
  constructor(
    private readonly ledger: LedgerRepository,
    private readonly pending: PendingActionsRepository,
    private readonly cfg: AppConfigService,
  ) {}

  /**
   * Adjust a broker's wallet. Below threshold: executes immediately via the
   * shared @lp/core dispatcher. Above threshold: enqueues to pending_actions
   * for a second admin to approve — the workers process executes via the
   * SAME @lp/core handler when the approval lands.
   *
   * Either branch writes an audit row in the same transaction as its state
   * change (audit-in-tx interceptor).
   */
  @Post('wallet-adjust')
  @RequireReauth()
  @AuditLog({ action: 'wallet.adjust', resourceType: 'wallet' })
  async walletAdjust(
    @Body(new ZodValidationPipe(walletAdjustSchema)) body: z.infer<typeof walletAdjustSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ): Promise<
    { status: 'executed'; entryIds: string[] } | { status: 'queued_for_approval'; actionId: string }
  > {
    const tx = requireTx(ctx);

    const amount = new Money(body.amount);
    if (amount.isZero() || amount.isNegative()) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'amount must be > 0',
        HttpStatus.BAD_REQUEST,
      );
    }

    const thresholdRupees = Money.fromPaise(this.cfg.get('ADMIN_4EYES_THRESHOLD_PAISE'));
    const overThreshold = amount.gt(thresholdRupees);

    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: body.brokerId,
      beforeState: {
        reason: body.reason,
        amount: amount.toString(),
        threshold: thresholdRupees.toString(),
      },
    };

    if (overThreshold) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const created = await this.pending.create(
        {
          actionType: 'wallet.adjust',
          payload: { ...body, currency: body.currency },
          reason: body.reason,
          requestedBy: ctx.user.userId,
          expiresAt,
        },
        tx,
      );
      ctx.audit.afterState = { status: 'queued_for_approval', actionId: created.actionId };
      return { status: 'queued_for_approval', actionId: created.actionId };
    }

    const result = await executeWalletAdjust(
      {
        brokerId: body.brokerId,
        direction: body.direction,
        amount: amount.toString(),
        currency: body.currency,
        reason: body.reason,
      },
      drizzleLedgerOps(this.ledger, tx),
    );

    const entryIds = [...result.entryIds];
    ctx.audit.afterState = { status: 'executed', entryIds };
    return { status: 'executed', entryIds };
  }
}
