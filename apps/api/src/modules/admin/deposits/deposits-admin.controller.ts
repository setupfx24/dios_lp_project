import { Controller, Get, HttpStatus, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'drizzle-orm';

import { ErrorCode } from '@lp/constants';
import { ulid } from '@lp/utils';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { ledgerEntries } from '../../ledger/schema/ledger.schema.js';
import { LedgerRepository } from '../../ledger/ledger.repository.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

interface DepositRow {
  request_id: string;
  broker_id: string;
  broker_name: string;
  amount: string;
  currency: string;
  method: string;
  reference: string | null;
  note: string | null;
  status: string;
  decided_by: string | null;
  created_at: Date | string;
  decided_at: Date | string | null;
}

/**
 * Admin review of broker-submitted deposit requests. Approving a PENDING
 * request credits the broker wallet with an immutable DEPOSIT ledger entry (in
 * the same audited transaction); rejecting just records the decision. The
 * request row itself carries the PENDING/APPROVED/REJECTED status.
 */
@ApiTags('admin/deposits')
@Controller('api/v1/admin/deposits')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard)
@RequireAdminRole('super_admin', 'ops', 'support', 'read_only')
export class DepositsAdminController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly ledger: LedgerRepository,
  ) {}

  private static readonly rows = <T>(r: unknown): T[] => (r as { rows?: T[] }).rows ?? [];

  private static map(r: DepositRow) {
    const iso = (v: Date | string | null) =>
      v == null ? null : v instanceof Date ? v.toISOString() : String(v);
    return {
      requestId: r.request_id,
      brokerId: r.broker_id,
      broker: r.broker_name,
      amount: r.amount,
      currency: r.currency,
      method: r.method,
      reference: r.reference,
      note: r.note,
      status: r.status,
      decidedBy: r.decided_by,
      createdAt: iso(r.created_at) as string,
      decidedAt: iso(r.decided_at),
    };
  }

  /** All deposit requests (optionally filtered by status), newest first. */
  @Get()
  async list(@Query('status') status?: string) {
    const statusFilter = status ?? null;
    const raw = DepositsAdminController.rows<DepositRow>(
      await this.db.execute(sql`
        SELECT d.request_id, d.broker_id, b.display_name AS broker_name,
               d.amount::text AS amount, d.currency, d.method, d.reference, d.note,
               d.status, d.decided_by, d.created_at, d.decided_at
        FROM ledger.deposit_requests d
        JOIN auth.brokers b ON b.broker_id = d.broker_id
        WHERE (${statusFilter}::text IS NULL OR d.status = ${statusFilter})
        ORDER BY d.id DESC
        LIMIT 200`),
    );
    return { items: raw.map((r) => DepositsAdminController.map(r)) };
  }

  /** Approve a PENDING request — credits the broker wallet + marks APPROVED. */
  @Post(':requestId/approve')
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'deposit.approve', resourceType: 'deposit', resourceIdParam: 'requestId' })
  async approve(@Param('requestId') requestId: string, @AdminCtx() ctx: AdminRequestContext) {
    const tx = requireTx(ctx);
    const found = DepositsAdminController.rows<DepositRow>(
      await tx.execute(sql`
        SELECT request_id, broker_id, '' AS broker_name, amount::text AS amount, currency,
               method, reference, note, status, decided_by, created_at, decided_at
        FROM ledger.deposit_requests WHERE request_id = ${requestId} LIMIT 1`),
    );
    const req = found[0];
    if (!req) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Deposit request not found', HttpStatus.NOT_FOUND);
    }
    if (req.status !== 'PENDING') {
      throw new DomainException(
        ErrorCode.CONFLICT,
        `Deposit request already ${req.status.toLowerCase()}`,
        HttpStatus.CONFLICT,
      );
    }

    // Credit the broker wallet with an immutable DEPOSIT ledger entry.
    const wallet = await this.ledger.findOrCreateWallet(req.broker_id, req.currency, tx);
    await tx.insert(ledgerEntries).values({
      entryId: ulid(),
      walletId: wallet.walletId,
      direction: 'CREDIT',
      amount: req.amount,
      currency: req.currency,
      referenceType: 'DEPOSIT',
      referenceId: requestId,
      description: `Deposit via ${req.method} (approved)`,
    });

    const decidedBy = ctx.user.email;
    await tx.execute(sql`
      UPDATE ledger.deposit_requests
      SET status = 'APPROVED', decided_by = ${decidedBy}, decided_at = now()
      WHERE request_id = ${requestId}`);

    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: requestId,
      afterState: {
        brokerId: req.broker_id,
        amount: req.amount,
        currency: req.currency,
        status: 'APPROVED',
      },
    };
    return { ok: true, status: 'APPROVED' as const };
  }

  /** Reject a PENDING request — records the decision, no wallet movement. */
  @Post(':requestId/reject')
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'deposit.reject', resourceType: 'deposit', resourceIdParam: 'requestId' })
  async reject(@Param('requestId') requestId: string, @AdminCtx() ctx: AdminRequestContext) {
    const tx = requireTx(ctx);
    const found = DepositsAdminController.rows<{ status: string; broker_id: string }>(
      await tx.execute(sql`
        SELECT status, broker_id FROM ledger.deposit_requests WHERE request_id = ${requestId} LIMIT 1`),
    );
    const req = found[0];
    if (!req) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Deposit request not found', HttpStatus.NOT_FOUND);
    }
    if (req.status !== 'PENDING') {
      throw new DomainException(
        ErrorCode.CONFLICT,
        `Deposit request already ${req.status.toLowerCase()}`,
        HttpStatus.CONFLICT,
      );
    }
    const decidedBy = ctx.user.email;
    await tx.execute(sql`
      UPDATE ledger.deposit_requests
      SET status = 'REJECTED', decided_by = ${decidedBy}, decided_at = now()
      WHERE request_id = ${requestId}`);

    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: requestId,
      afterState: { brokerId: req.broker_id, status: 'REJECTED' },
    };
    return { ok: true, status: 'REJECTED' as const };
  }
}
