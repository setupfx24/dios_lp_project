import type { Db } from '../../../database/connection.js';
import type { AdminSessionRow, UserRow } from '../../auth/schema/user.schema.js';

/**
 * Per-request context for admin endpoints. Lives on the Fastify request as
 * `req.adminCtx`. Holds:
 *   - the authenticated admin user
 *   - the current session row (so guards can update lastActivityAt)
 *   - the active Drizzle transaction handle, set by `AuditLogInterceptor`
 *     when an endpoint is tagged with @AuditLog. Repositories that take an
 *     optional `tx?: Db` then participate in the same transaction as the
 *     audit insert — atomicity invariant: action + audit succeed or fail
 *     together.
 */
export interface AdminAudit {
  action: string;
  resourceType?: string;
  resourceId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AdminRequestContext {
  user: UserRow;
  session: AdminSessionRow;
  tx?: Db;
  audit?: AdminAudit;
}

/**
 * Narrowing helpers — preferred over `ctx.tx!` so we get a meaningful error
 * if an endpoint forgets `@AuditLog`.
 */
export function requireTx(ctx: AdminRequestContext): Db {
  if (!ctx.tx) {
    throw new Error('admin endpoint requires @AuditLog (no transaction in context)');
  }
  return ctx.tx;
}

export function requireAudit(ctx: AdminRequestContext): AdminAudit {
  if (!ctx.audit) {
    throw new Error('admin endpoint requires @AuditLog (no audit in context)');
  }
  return ctx.audit;
}

export function requireAdminCtx(req: { adminCtx?: AdminRequestContext }): AdminRequestContext {
  if (!req.adminCtx) {
    throw new Error('admin endpoint requires AdminJwtGuard upstream');
  }
  return req.adminCtx;
}
