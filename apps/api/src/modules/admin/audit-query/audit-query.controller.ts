import { Controller, Get, Inject, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { z } from 'zod';

import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { auditLogs } from '../../audit/schema/audit.schema.js';
import { RequireAdminRole } from '../common/admin-decorators.js';
import { AdminJwtGuard } from '../common/admin-jwt.guard.js';
import { AdminRoleGuard } from '../common/admin-role.guard.js';
import { TotpVerifiedGuard } from '../common/totp-verified.guard.js';

const querySchema = z.object({
  actorId: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

@ApiTags('admin/audit')
@Controller('api/v1/admin/audit')
@UseGuards(AdminJwtGuard, TotpVerifiedGuard, AdminRoleGuard)
@RequireAdminRole('super_admin', 'ops', 'support', 'read_only')
export class AuditQueryController {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Db) {}

  @Get('logs')
  @UsePipes(new ZodValidationPipe(querySchema))
  async list(@Query() q: z.infer<typeof querySchema>) {
    const conds = [];
    if (q.actorId) {
      conds.push(eq(auditLogs.actorId, q.actorId));
    }
    if (q.action) {
      conds.push(eq(auditLogs.action, q.action));
    }
    if (q.resourceType) {
      conds.push(eq(auditLogs.resourceType, q.resourceType));
    }
    if (q.from) {
      conds.push(gte(auditLogs.createdAt, new Date(q.from)));
    }
    if (q.to) {
      conds.push(lt(auditLogs.createdAt, new Date(q.to)));
    }

    const where = conds.length > 0 ? and(...conds) : undefined;
    const items = await this.db
      .select()
      .from(auditLogs)
      .where(where ?? undefined)
      .orderBy(desc(auditLogs.id))
      .limit(q.limit);
    return { items };
  }
}
