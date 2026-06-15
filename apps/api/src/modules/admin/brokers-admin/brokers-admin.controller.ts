import { randomBytes } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';
import { ulid } from '@lp/utils/id';
import { Money } from '@lp/utils/money';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { users } from '../../auth/schema/user.schema.js';
import { apiKeys, brokers } from '../../brokers/schema/broker.schema.js';
import { ledgerEntries, wallets } from '../../ledger/schema/ledger.schema.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole, RequireReauth } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { ReauthGuard } from '../common/reauth.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

/**
 * Onboard a broker. The admin supplies a display name + contact email; the
 * platform GENERATES the dashboard login password and the HMAC API secret,
 * funds the broker wallet with a default opening balance, and returns the
 * full credential bundle EXACTLY ONCE (secrets are argon2-hashed at rest and
 * cannot be recovered later). The operator copies these into the dios broker.
 */
const createBrokerSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().email(),
  /** Dashboard login email; defaults to contactEmail when omitted. */
  loginEmail: z.string().trim().toLowerCase().email().optional(),
  /** Opening wallet balance in major units. Default 5000. */
  initialBalance: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, 'positive decimal')
    .default('5000'),
  currency: z.string().trim().min(1).max(8).default('USD'),
});

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

  /**
   * Create a broker + dashboard user + HMAC API key + funded wallet in one
   * transaction. Returns the plaintext login password and `prefix.secret`
   * API key ONCE — they are not retrievable afterwards.
   */
  @Post()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'broker.create', resourceType: 'broker' })
  @UsePipes(new ZodValidationPipe(createBrokerSchema))
  async create(
    @Body() body: z.infer<typeof createBrokerSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ): Promise<{
    brokerId: string;
    displayName: string;
    contactEmail: string;
    login: { email: string; password: string };
    apiKey: { prefix: string; secret: string; full: string };
    wallet: { walletId: string; currency: string; balance: string };
  }> {
    const tx = requireTx(ctx);

    // This platform supports exactly ONE broker. Reject onboarding if a broker
    // already exists (the UI also hides the form, this is the authoritative guard).
    const existingBroker = await tx.select({ brokerId: brokers.brokerId }).from(brokers).limit(1);
    if (existingBroker[0]) {
      throw new DomainException(
        ErrorCode.CONFLICT,
        'A broker already exists. Only one broker can be onboarded on this platform.',
        HttpStatus.CONFLICT,
      );
    }

    const amount = new Money(body.initialBalance);
    if (amount.isZero() || amount.isNegative()) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'initialBalance must be > 0',
        HttpStatus.BAD_REQUEST,
      );
    }

    const loginEmail = body.loginEmail ?? body.contactEmail;

    // Reject duplicate dashboard email up front for a clean error (the unique
    // index would otherwise surface as a generic constraint violation).
    const emailTaken = await tx
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.email, loginEmail))
      .limit(1);
    if (emailTaken[0]) {
      throw new DomainException(
        ErrorCode.CONFLICT,
        `A user with email ${loginEmail} already exists`,
        HttpStatus.CONFLICT,
      );
    }

    // --- Generate identifiers + secrets ---
    const slug =
      body.displayName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32) || 'broker';
    const brokerId = `${slug}-${randomBytes(3).toString('hex')}`;
    const keyPrefix = `lp_${randomBytes(4).toString('hex')}`;
    const secret = randomBytes(24).toString('base64url');
    const password = randomBytes(12).toString('base64url');

    const [secretHash, passwordHash] = await Promise.all([
      argon2.hash(secret),
      argon2.hash(password),
    ]);

    // --- Persist (all inside the audit transaction) ---
    await tx.insert(brokers).values({
      brokerId,
      displayName: body.displayName,
      contactEmail: body.contactEmail,
    });

    await tx.insert(apiKeys).values({
      apiKeyId: ulid(),
      brokerId,
      label: 'default',
      keyPrefix,
      secretHash,
    });

    await tx.insert(users).values({
      userId: ulid(),
      email: loginEmail,
      passwordHash,
      displayName: body.displayName,
      role: 'broker_user',
      userType: 'broker_user',
      brokerId,
    });

    const walletId = ulid();
    await tx.insert(wallets).values({ walletId, brokerId, currency: body.currency });

    const openingBalance = amount.toString();
    await tx.insert(ledgerEntries).values({
      entryId: ulid(),
      walletId,
      direction: 'CREDIT',
      amount: openingBalance,
      currency: body.currency,
      referenceType: 'DEPOSIT',
      referenceId: brokerId,
      description: 'Opening balance (broker onboarding)',
    });

    // Audit captures NON-secret state only — never the password or secret.
    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: brokerId,
      afterState: {
        brokerId,
        displayName: body.displayName,
        contactEmail: body.contactEmail,
        loginEmail,
        keyPrefix,
        walletId,
        currency: body.currency,
        openingBalance,
      },
    };

    return {
      brokerId,
      displayName: body.displayName,
      contactEmail: body.contactEmail,
      login: { email: loginEmail, password },
      apiKey: { prefix: keyPrefix, secret, full: `${keyPrefix}.${secret}` },
      wallet: { walletId, currency: body.currency, balance: openingBalance },
    };
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
