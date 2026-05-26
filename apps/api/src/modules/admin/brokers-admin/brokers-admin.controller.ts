import { randomBytes } from 'node:crypto';

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';
import { ulid } from '@lp/utils/id';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { strongPasswordSchema } from '../../../common/passwords/strong-password.schema.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { users } from '../../auth/schema/user.schema.js';
import { BrokersRepository } from '../../brokers/brokers.repository.js';
import { apiKeys, brokers } from '../../brokers/schema/broker.schema.js';
import { orders } from '../../orders/schema/order.schema.js';
import { trades } from '../../trades/schema/trade.schema.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole, RequireReauth } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { ReauthGuard } from '../common/reauth.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

/**
 * Inline first-user block for the combined "create broker + first dashboard
 * user" flow. Keeping it optional preserves backward compat: a request that
 * omits firstUser creates just the broker entity, like before.
 *
 * If firstUser is supplied, both the broker row and the user row are inserted
 * inside the same audit transaction — partial states are impossible.
 */
const createBrokerFirstUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(120),
  // Admin-supplied — must meet shared strong-password policy.
  password: strongPasswordSchema,
});

const createBrokerSchema = z.object({
  brokerId: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'lowercase, digits, _ or - only; must start alnum'),
  displayName: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().toLowerCase().email(),
  firstUser: createBrokerFirstUserSchema.optional(),
});

const issueApiKeySchema = z.object({
  label: z.string().trim().min(1).max(80),
  ipAllowlist: z.array(z.string().trim()).optional(),
});

const createBrokerUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(1).max(120),
  // Optional — if omitted, server generates a strong random password and
  // returns it once. If admin supplies one, it must meet the shared
  // strong-password policy (12+ chars, upper/lower/digit/special).
  temporaryPassword: strongPasswordSchema.optional(),
});

@ApiTags('admin/brokers')
@Controller('api/v1/admin/brokers')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard, ReauthGuard)
@RequireAdminRole('super_admin', 'ops', 'support', 'read_only')
export class BrokersAdminController {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly brokers: BrokersRepository,
  ) {}

  // ───────────────────── Broker lifecycle ─────────────────────

  @Get()
  list() {
    return this.db.select().from(brokers);
  }

  @Get(':brokerId')
  async detail(@Param('brokerId') brokerId: string) {
    const row = await this.brokers.findByBrokerId(brokerId);
    if (!row) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    return row;
  }

  @Post()
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'broker.create', resourceType: 'broker' })
  async create(
    @Body(new ZodValidationPipe(createBrokerSchema)) body: z.infer<typeof createBrokerSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);
    const existing = await tx
      .select({ brokerId: brokers.brokerId })
      .from(brokers)
      .where(eq(brokers.brokerId, body.brokerId))
      .limit(1);
    if (existing.length > 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Broker ${body.brokerId} already exists`,
        HttpStatus.CONFLICT,
      );
    }

    // If admin supplied a firstUser block, pre-check email uniqueness BEFORE
    // inserting the broker — avoids a half-rolled-back state where the
    // broker row gets a Postgres-level UNIQUE violation surprise mid-insert.
    if (body.firstUser) {
      const conflict = await tx
        .select({ userId: users.userId })
        .from(users)
        .where(eq(users.email, body.firstUser.email))
        .limit(1);
      if (conflict.length > 0) {
        throw new DomainException(
          ErrorCode.VALIDATION_FAILED,
          `User with email ${body.firstUser.email} already exists`,
          HttpStatus.CONFLICT,
        );
      }
    }

    const created = await this.brokers.insertBroker(
      {
        brokerId: body.brokerId,
        displayName: body.displayName,
        contactEmail: body.contactEmail,
        status: 'active',
      },
      tx,
    );

    // Same-tx first-user creation. If hashing/insert fails the broker row
    // rolls back too — onboarding is all-or-nothing.
    let firstUserResult: { userId: string; email: string } | null = null;
    if (body.firstUser) {
      const userId = ulid();
      const passwordHash = await argon2.hash(body.firstUser.password);
      await tx.insert(users).values({
        userId,
        email: body.firstUser.email,
        passwordHash,
        displayName: body.firstUser.displayName,
        role: 'broker_user',
        userType: 'broker_user',
        brokerId: created.brokerId,
        mustChangePassword: false,
      });
      firstUserResult = { userId, email: body.firstUser.email };
    }

    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: created.brokerId,
      afterState: {
        brokerId: created.brokerId,
        displayName: created.displayName,
        contactEmail: created.contactEmail,
        status: created.status,
        // Plaintext password is intentionally NOT in audit metadata — only
        // the fact a user was provisioned alongside.
        firstUserId: firstUserResult?.userId ?? null,
        firstUserEmail: firstUserResult?.email ?? null,
      },
    };
    return {
      ...created,
      firstUser: firstUserResult,
    };
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

  // ───────────────────── API keys ─────────────────────

  @Get(':brokerId/api-keys')
  async listApiKeys(@Param('brokerId') brokerId: string) {
    const broker = await this.brokers.findByBrokerId(brokerId);
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    const rows = await this.brokers.listApiKeysForBroker(brokerId);
    // Strictly no secret material — only metadata. Plaintext is shown ONCE
    // at issuance time and can never be reconstructed from these rows.
    return rows.map((r) => ({
      apiKeyId: r.apiKeyId,
      label: r.label,
      keyPrefix: r.keyPrefix,
      ipAllowlist: r.ipAllowlist,
      createdAt: r.createdAt,
      lastUsedAt: r.lastUsedAt,
      revokedAt: r.revokedAt,
      status: r.revokedAt ? 'revoked' : 'active',
    }));
  }

  @Post(':brokerId/api-keys')
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'broker.api_key.issue', resourceType: 'api_key' })
  async issueApiKey(
    @Param('brokerId') brokerId: string,
    @Body(new ZodValidationPipe(issueApiKeySchema)) body: z.infer<typeof issueApiKeySchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);
    const broker = (
      await tx.select().from(brokers).where(eq(brokers.brokerId, brokerId)).limit(1)
    )[0];
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    if (broker.status !== 'active') {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Broker is ${broker.status}; reactivate before issuing keys`,
        HttpStatus.CONFLICT,
      );
    }

    const prefix = `lp_${randomBytes(4).toString('hex')}`;
    const secret = randomBytes(32).toString('base64url');
    const apiKeyId = ulid();
    const secretHash = await argon2.hash(secret);

    const inserted = await this.brokers.insertApiKey(
      {
        apiKeyId,
        brokerId,
        label: body.label,
        keyPrefix: prefix,
        secretHash,
        ipAllowlist: body.ipAllowlist ?? [],
      },
      tx,
    );

    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: apiKeyId,
      afterState: {
        brokerId,
        label: body.label,
        keyPrefix: prefix,
        // The secret is intentionally NOT in the audit payload.
      },
    };

    return {
      apiKeyId: inserted.apiKeyId,
      label: inserted.label,
      keyPrefix: inserted.keyPrefix,
      brokerId,
      createdAt: inserted.createdAt,
      // **Plaintext returned exactly once.** After this response the secret
      // exists only as an Argon2 hash in the database; it cannot be re-derived.
      plaintextApiKey: `${prefix}.${secret}`,
      warning: 'This is the only time the plaintext secret is shown. Copy it now.',
    };
  }

  @Delete(':brokerId/api-keys/:apiKeyId')
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({
    action: 'broker.api_key.revoke',
    resourceType: 'api_key',
    resourceIdParam: 'apiKeyId',
  })
  async revokeApiKey(
    @Param('brokerId') brokerId: string,
    @Param('apiKeyId') apiKeyId: string,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);
    const before = (
      await tx.select().from(apiKeys).where(eq(apiKeys.apiKeyId, apiKeyId)).limit(1)
    )[0];
    if (!before) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'API key not found', HttpStatus.NOT_FOUND);
    }
    if (before.brokerId !== brokerId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'API key does not belong to this broker',
        HttpStatus.FORBIDDEN,
      );
    }
    if (before.revokedAt) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'API key is already revoked',
        HttpStatus.CONFLICT,
      );
    }
    const revoked = await this.brokers.revokeApiKey(apiKeyId, tx);
    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: { revokedAt: before.revokedAt },
      afterState: { revokedAt: revoked?.revokedAt },
    };
    return {
      apiKeyId: revoked?.apiKeyId,
      revokedAt: revoked?.revokedAt,
    };
  }

  // ───────────────────── Dashboard users (broker_user) ─────────────────────

  @Get(':brokerId/users')
  async listBrokerUsers(@Param('brokerId') brokerId: string) {
    const broker = await this.brokers.findByBrokerId(brokerId);
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    const rows = await this.db
      .select({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
        suspendedAt: users.suspendedAt,
        mustChangePassword: users.mustChangePassword,
      })
      .from(users)
      .where(
        and(
          eq(users.brokerId, brokerId),
          eq(users.userType, 'broker_user'),
          isNull(users.deletedAt),
        ),
      )
      .orderBy(desc(users.createdAt));
    return rows.map((u) => ({
      ...u,
      status: u.suspendedAt ? 'suspended' : 'active',
    }));
  }

  @Post(':brokerId/users')
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({ action: 'broker.user.create', resourceType: 'broker_user' })
  async createBrokerUser(
    @Param('brokerId') brokerId: string,
    @Body(new ZodValidationPipe(createBrokerUserSchema))
    body: z.infer<typeof createBrokerUserSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);
    const broker = (
      await tx.select().from(brokers).where(eq(brokers.brokerId, brokerId)).limit(1)
    )[0];
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    if (broker.status !== 'active') {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Broker is ${broker.status}; reactivate before adding users`,
        HttpStatus.CONFLICT,
      );
    }

    // Email uniqueness — users.email has a UNIQUE index, but the friendlier
    // error message helps the admin UI surface this clearly instead of a 500.
    const existing = await tx
      .select({ userId: users.userId })
      .from(users)
      .where(eq(users.email, body.email))
      .limit(1);
    if (existing.length > 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        `Email ${body.email} is already registered`,
        HttpStatus.CONFLICT,
      );
    }

    // Use admin-provided password if given; otherwise generate a strong random
    // one and return it ONCE (same shown-once pattern as API key issuance).
    const generated = body.temporaryPassword == null;
    const plaintext = body.temporaryPassword ?? generateTempPassword();
    const passwordHash = await argon2.hash(plaintext);
    const userId = ulid();

    const [created] = await tx
      .insert(users)
      .values({
        userId,
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        role: 'broker_user',
        userType: 'broker_user',
        brokerId,
        mustChangePassword: true,
      })
      .returning();

    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: userId,
      afterState: {
        brokerId,
        email: body.email,
        displayName: body.displayName,
        passwordSource: generated ? 'generated' : 'admin_provided',
        // Plaintext is intentionally NOT in the audit payload.
      },
    };

    return {
      userId: created?.userId,
      email: created?.email,
      displayName: created?.displayName,
      brokerId,
      createdAt: created?.createdAt,
      // Plaintext returned exactly once. After this response only the
      // Argon2 hash exists. Lose it = the admin must rotate via password reset.
      temporaryPassword: plaintext,
      passwordWasGenerated: generated,
      warning: 'This is the only time the plaintext password is shown. Copy it now.',
    };
  }

  @Post(':brokerId/users/:userId/suspend')
  @RequireReauth()
  @RequireAdminRole('super_admin', 'ops')
  @AuditLog({
    action: 'broker.user.suspend',
    resourceType: 'broker_user',
    resourceIdParam: 'userId',
  })
  async suspendBrokerUser(
    @Param('brokerId') brokerId: string,
    @Param('userId') userId: string,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);
    const before = (await tx.select().from(users).where(eq(users.userId, userId)).limit(1))[0];
    if (!before) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'User not found', HttpStatus.NOT_FOUND);
    }
    if (before.brokerId !== brokerId || before.userType !== 'broker_user') {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'User does not belong to this broker',
        HttpStatus.FORBIDDEN,
      );
    }
    if (before.suspendedAt) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'User is already suspended',
        HttpStatus.CONFLICT,
      );
    }
    const [updated] = await tx
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.userId, userId))
      .returning();
    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: { suspendedAt: before.suspendedAt },
      afterState: { suspendedAt: updated?.suspendedAt },
    };
    return { userId: updated?.userId, suspendedAt: updated?.suspendedAt };
  }

  // ───────────────────── Hard delete ─────────────────────

  /**
   * Returns the count of records that would block a hard delete. UI calls
   * this before showing the confirm modal to either enable the delete
   * (all zero) or display "cannot delete — close instead" with the breakdown.
   *
   * Counts are scoped to the broker. We don't check audit_logs — those are
   * append-only by design and ref the broker only via metadata text, not FK.
   */
  @Get(':brokerId/dependents')
  async dependents(@Param('brokerId') brokerId: string) {
    const broker = await this.brokers.findByBrokerId(brokerId);
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }
    const [orderCount] = await this.db
      .select({ c: sql<string>`count(*)::text` })
      .from(orders)
      .where(eq(orders.brokerId, brokerId));
    const [tradeCount] = await this.db
      .select({ c: sql<string>`count(*)::text` })
      .from(trades)
      .where(eq(trades.brokerId, brokerId));
    const [keyCount] = await this.db
      .select({ c: sql<string>`count(*)::text` })
      .from(apiKeys)
      .where(eq(apiKeys.brokerId, brokerId));
    const [userCount] = await this.db
      .select({ c: sql<string>`count(*)::text` })
      .from(users)
      .where(eq(users.brokerId, brokerId));

    return {
      orders: Number(orderCount?.c ?? '0'),
      trades: Number(tradeCount?.c ?? '0'),
      apiKeys: Number(keyCount?.c ?? '0'),
      users: Number(userCount?.c ?? '0'),
    };
  }

  /**
   * Hard delete. Refused if any history exists (orders / trades / api keys /
   * users). For brokers with history, use suspend; a future `close` endpoint
   * can mark them permanently inactive without touching the audit trail.
   *
   * Reauth-gated + super-admin only + audited. The audit row carries the
   * full broker payload so it remains discoverable after the row is gone.
   */
  @Delete(':brokerId')
  @RequireReauth()
  @RequireAdminRole('super_admin')
  @AuditLog({ action: 'broker.delete', resourceType: 'broker', resourceIdParam: 'brokerId' })
  async deleteBroker(@Param('brokerId') brokerId: string, @AdminCtx() ctx: AdminRequestContext) {
    const tx = requireTx(ctx);
    const broker = (
      await tx.select().from(brokers).where(eq(brokers.brokerId, brokerId)).limit(1)
    )[0];
    if (!broker) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Broker not found', HttpStatus.NOT_FOUND);
    }

    // FK-blocker counts — re-checked inside the same transaction so a
    // concurrent INSERT can't sneak in between the preflight and the delete.
    const [orderCount] = await tx
      .select({ c: sql<string>`count(*)::text` })
      .from(orders)
      .where(eq(orders.brokerId, brokerId));
    const [tradeCount] = await tx
      .select({ c: sql<string>`count(*)::text` })
      .from(trades)
      .where(eq(trades.brokerId, brokerId));
    const [keyCount] = await tx
      .select({ c: sql<string>`count(*)::text` })
      .from(apiKeys)
      .where(eq(apiKeys.brokerId, brokerId));
    const [userCount] = await tx
      .select({ c: sql<string>`count(*)::text` })
      .from(users)
      .where(eq(users.brokerId, brokerId));

    const blockers = {
      orders: Number(orderCount?.c ?? '0'),
      trades: Number(tradeCount?.c ?? '0'),
      apiKeys: Number(keyCount?.c ?? '0'),
      users: Number(userCount?.c ?? '0'),
    };
    const hasHistory = Object.values(blockers).some((n) => n > 0);

    if (hasHistory) {
      throw new DomainException(
        ErrorCode.CONFLICT,
        `Cannot delete: broker has ${blockers.orders} orders, ${blockers.trades} trades, ${blockers.apiKeys} api keys, ${blockers.users} users. Use suspend instead — audit trail must be preserved.`,
        HttpStatus.CONFLICT,
      );
    }

    await tx.delete(brokers).where(eq(brokers.brokerId, brokerId));

    ctx.audit = {
      ...requireAudit(ctx),
      beforeState: {
        brokerId: broker.brokerId,
        displayName: broker.displayName,
        contactEmail: broker.contactEmail,
        status: broker.status,
        createdAt: broker.createdAt,
      },
      // afterState is the post-action snapshot. For hard delete, the row no
      // longer exists — record that explicitly rather than null so the audit
      // viewer shows {deleted: true} instead of an empty diff.
      afterState: { deleted: true },
    };

    return { brokerId: broker.brokerId, deletedAt: new Date().toISOString() };
  }
}

/** 16-char URL-safe password with mixed alphanumerics. */
function generateTempPassword(): string {
  // 12 bytes → 16 chars base64url, plenty of entropy (96 bits).
  return randomBytes(12).toString('base64url');
}
