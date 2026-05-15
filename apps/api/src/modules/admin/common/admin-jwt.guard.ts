import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../../common/exceptions/domain.exception.js';
import { AppConfigService } from '../../../config/config.module.js';
import { AdminAuthRepository } from '../auth/admin-auth.repository.js';
import { AdminAuthService } from '../auth/admin-auth.service.js';

import { type AdminRequestContext } from './admin-context.js';

import type { FastifyRequest } from 'fastify';

const ADMIN_COOKIE = 'lp_admin_access';

declare module 'fastify' {
  interface FastifyRequest {
    adminCtx?: AdminRequestContext;
  }
}

/**
 * Authenticates admin requests via the `lp_admin_access` httpOnly cookie
 * (or `X-Admin-Authorization: Bearer <token>` for service-to-service).
 * Refuses tokens issued under the broker JWT secret (separate trust domain).
 *
 * On success, opens an admin-context async-local-storage scope so the
 * @AuditLog interceptor can co-locate its audit insert with the controller's
 * transaction.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly repo: AdminAuthRepository,
    private readonly cfg: AppConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { cookies?: Record<string, string> }>();

    const token = this.extractToken(req);
    if (!token) {
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Missing admin token',
        HttpStatus.UNAUTHORIZED,
      );
    }

    let payload;
    try {
      payload = await this.auth.verifyJwt(token);
    } catch {
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        'Admin token invalid or expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const session = await this.repo.findSession(payload.sid);
    if (!session) {
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        'Admin session not found or revoked',
        HttpStatus.UNAUTHORIZED,
      );
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        'Admin session expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Idle timeout
    const idleMs = this.cfg.get('ADMIN_IDLE_TIMEOUT_SECONDS') * 1000;
    if (Date.now() - session.lastActivityAt.getTime() > idleMs) {
      await this.repo.revokeSession(session.sessionId);
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        'Admin session idle-timed-out',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.repo.findAdminByUserId(payload.sub);
    if (!user || user.suspendedAt) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Admin user suspended or missing',
        HttpStatus.FORBIDDEN,
      );
    }

    await this.repo.bumpActivity(session.sessionId);

    const ctx: AdminRequestContext = { user, session };
    req.adminCtx = ctx;
    return true;
  }

  private extractToken(req: FastifyRequest & { cookies?: Record<string, string> }): string | null {
    const header = req.headers['x-admin-authorization'];
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    const cookieToken = req.cookies?.[ADMIN_COOKIE];
    return cookieToken ?? null;
  }
}
