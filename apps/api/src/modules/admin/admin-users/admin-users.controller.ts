import { Body, Controller, Get, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { ErrorCode } from '@lp/constants';
import { ulid } from '@lp/utils/id';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { strongPasswordSchema } from '../../../common/passwords/strong-password.schema.js';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { users } from '../../auth/schema/user.schema.js';
import { requireAudit, requireTx, type AdminRequestContext } from '../common/admin-context.js';
import { AdminCtx, AuditLog, RequireAdminRole, RequireReauth } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { ReauthGuard } from '../common/reauth.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';


const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().min(1).max(80),
  adminRole: z.enum(['super_admin', 'ops', 'support', 'read_only']),
  temporaryPassword: strongPasswordSchema,
});

@ApiTags('admin/users')
@Controller('api/v1/admin/users')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard, ReauthGuard)
@RequireAdminRole('super_admin')
export class AdminUsersController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  @Get()
  list() {
    return this.db
      .select({
        userId: users.userId,
        email: users.email,
        displayName: users.displayName,
        adminRole: users.adminRole,
        totpVerifiedAt: users.totpVerifiedAt,
        suspendedAt: users.suspendedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.userType, 'admin_user'));
  }

  @Post()
  @RequireReauth()
  @AuditLog({ action: 'admin_user.create', resourceType: 'admin_user' })
  async create(
    @Body(new ZodValidationPipe(createAdminSchema)) body: z.infer<typeof createAdminSchema>,
    @AdminCtx() ctx: AdminRequestContext,
  ) {
    const tx = requireTx(ctx);
    const passwordHash = await argon2.hash(body.temporaryPassword);
    const userId = ulid();
    const [created] = await tx
      .insert(users)
      .values({
        userId,
        email: body.email,
        passwordHash,
        displayName: body.displayName,
        role: 'lp_admin',
        userType: 'admin_user',
        adminRole: body.adminRole,
        mustChangePassword: true,
      })
      .returning();
    ctx.audit = {
      ...requireAudit(ctx),
      resourceId: userId,
      afterState: { email: body.email, adminRole: body.adminRole },
    };
    return { userId: created?.userId, email: created?.email };
  }

  @Post(':userId/suspend')
  @RequireReauth()
  @AuditLog({ action: 'admin_user.suspend', resourceType: 'admin_user', resourceIdParam: 'userId' })
  async suspend(@Param('userId') userId: string, @AdminCtx() ctx: AdminRequestContext) {
    if (userId === ctx.user.userId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Cannot suspend yourself',
        HttpStatus.FORBIDDEN,
      );
    }
    const tx = requireTx(ctx);
    const [updated] = await tx
      .update(users)
      .set({ suspendedAt: new Date() })
      .where(eq(users.userId, userId))
      .returning();
    ctx.audit = {
      ...requireAudit(ctx),
      afterState: { suspendedAt: updated?.suspendedAt?.toISOString() },
    };
    return { ok: true };
  }

  @Post(':userId/reset-2fa')
  @RequireReauth()
  @AuditLog({
    action: 'admin_user.reset_2fa',
    resourceType: 'admin_user',
    resourceIdParam: 'userId',
  })
  async reset2fa(@Param('userId') userId: string, @AdminCtx() ctx: AdminRequestContext) {
    if (userId === ctx.user.userId) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Cannot reset your own 2FA via this endpoint — use recovery code',
        HttpStatus.FORBIDDEN,
      );
    }
    const tx = requireTx(ctx);
    await tx
      .update(users)
      .set({ totpSecretEnc: null, totpVerifiedAt: null, recoveryCodesHash: null })
      .where(eq(users.userId, userId));
    return { ok: true };
  }
}
