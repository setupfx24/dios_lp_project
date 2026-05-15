import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, from, lastValueFrom } from 'rxjs';

import { ulid } from '@lp/utils/id';

import { DRIZZLE_DB, type Db } from '../../../database/connection.js';
import { auditLogs } from '../../audit/schema/audit.schema.js';

import { AUDIT_LOG_KEY, type AuditLogConfig } from './admin-decorators.js';

import type { AdminRequestContext } from './admin-context.js';
import type { FastifyRequest } from 'fastify';

/**
 * If the endpoint is tagged with @AuditLog:
 *
 *   1. Open a Drizzle transaction.
 *   2. Place the tx handle on `req.adminCtx.tx` so repos can opt into it.
 *   3. Run the controller.
 *   4. Insert an audit row inside the same tx (using the configured action,
 *      plus anything the controller wrote to `adminCtx.audit`).
 *   5. Commit. If anything throws, the whole tx rolls back — action AND
 *      audit are abandoned together.
 *
 * Endpoints WITHOUT @AuditLog are passed through untouched.
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(DRIZZLE_DB) private readonly db: Db,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const config = this.reflector.getAllAndOverride<AuditLogConfig | undefined>(AUDIT_LOG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!config) {
      return next.handle();
    }

    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { adminCtx?: AdminRequestContext }>();
    const ctx = req.adminCtx;
    if (!ctx) {
      return next.handle();
    }

    return from(this.runInTx(ctx, req, config, next));
  }

  private async runInTx(
    ctx: AdminRequestContext,
    req: FastifyRequest,
    config: AuditLogConfig,
    next: CallHandler,
  ): Promise<unknown> {
    return this.db.transaction(async (tx) => {
      ctx.tx = tx;
      ctx.audit = {
        action: config.action,
        ...(config.resourceType ? { resourceType: config.resourceType } : {}),
      };

      // If a resource id can be derived from the URL params, capture it now;
      // the controller can override via ctx.audit.
      if (config.resourceIdParam) {
        const params = (req.params ?? {}) as Record<string, string>;
        const id = params[config.resourceIdParam];
        if (id) {
          ctx.audit.resourceId = id;
        }
      }

      let result: unknown;
      try {
        result = await lastValueFrom(next.handle());
      } catch (err) {
        // Audit *failures* are still recorded (rolled back with the action,
        // but we want at least the attempt to be visible if a higher-level
        // logger captures the throw). Re-throwing rolls back the tx.
        ctx.audit.metadata = { ...(ctx.audit.metadata ?? {}), error: errToObject(err) };
        await this.writeAudit(ctx, req, 'failure', tx);
        throw err;
      }

      await this.writeAudit(ctx, req, 'success', tx);
      return result;
    });
  }

  private async writeAudit(
    ctx: AdminRequestContext,
    req: FastifyRequest,
    outcome: 'success' | 'failure',
    tx: Db,
  ): Promise<void> {
    const a = ctx.audit;
    if (!a) {
      return;
    }
    await tx.insert(auditLogs).values({
      auditId: ulid(),
      actorType: 'user',
      actorId: ctx.user.userId,
      action: a.action,
      resourceType: a.resourceType ?? null,
      resourceId: a.resourceId ?? null,
      outcome,
      metadata: {
        ...(a.beforeState ? { beforeState: a.beforeState } : {}),
        ...(a.afterState ? { afterState: a.afterState } : {}),
        ...(a.metadata ?? {}),
      },
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}

function errToObject(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { value: String(err) };
}
