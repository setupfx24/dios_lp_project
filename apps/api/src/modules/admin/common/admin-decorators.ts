import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AdminRequestContext } from './admin-context.js';
import type { FastifyRequest } from 'fastify';

export type AdminRoleName = 'super_admin' | 'ops' | 'support' | 'read_only';

export const ADMIN_ROLES_KEY = 'admin:roles';
export const REQUIRE_REAUTH_KEY = 'admin:require-reauth';
export const AUDIT_LOG_KEY = 'admin:audit-log';

/**
 * Restrict an admin endpoint to one or more `admin_role` values.
 * Combine with `AdminJwtGuard` + `TotpVerifiedGuard` + `AdminRoleGuard`.
 */
export const RequireAdminRole = (...roles: AdminRoleName[]) => SetMetadata(ADMIN_ROLES_KEY, roles);

/**
 * Mark an endpoint as sensitive — `ReauthGuard` will require a fresh
 * password re-verification (presented as `X-Reauth-Token`) within the
 * configured window (default 5 minutes).
 */
export const RequireReauth = () => SetMetadata(REQUIRE_REAUTH_KEY, true);

export interface AuditLogConfig {
  action: string;
  resourceType?: string;
  /**
   * Param name on the body / params to use as `resource_id`. Optional —
   * controllers can also set it explicitly via getAdminContextOrThrow().audit.
   */
  resourceIdParam?: string;
}

/**
 * Tag an endpoint with the audit action it performs. The `AuditLogInterceptor`
 * inserts a row into `audit.audit_logs` using the SAME transaction as the
 * controller's state change. If audit insert fails, the transaction rolls back.
 */
export const AuditLog = (config: AuditLogConfig | string) =>
  SetMetadata(AUDIT_LOG_KEY, typeof config === 'string' ? { action: config } : config);

export const AdminUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest & { adminCtx?: AdminRequestContext }>();
  return req.adminCtx?.user;
});

export const AdminCtx = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<FastifyRequest & { adminCtx?: AdminRequestContext }>();
  return req.adminCtx;
});
