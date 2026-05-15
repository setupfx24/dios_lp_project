import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@lp/constants';

import { ROLES_KEY } from '../../common/decorators/current-user.decorator.js';
import { DomainException } from '../../common/exceptions/domain.exception.js';
import { AuditService } from '../audit/audit.service.js';

import { AuthService } from './auth.service.js';

import type { UserRole } from '@lp/types';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const token = this.extractToken(req);
    if (!token) {
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_INVALID,
        'Missing token',
        HttpStatus.UNAUTHORIZED,
      );
    }
    let payload;
    try {
      payload = await this.auth.verify(token);
    } catch {
      throw new DomainException(
        ErrorCode.AUTH_TOKEN_EXPIRED,
        'Token invalid or expired',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && required.length > 0 && !required.includes(payload.role)) {
      await this.audit.record({
        actorType: 'user',
        actorId: payload.sub,
        action: 'rbac.deny',
        outcome: 'failure',
        metadata: { required, actual: payload.role, path: req.url },
      });
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Insufficient role',
        HttpStatus.FORBIDDEN,
      );
    }

    (req as FastifyRequest & { user: typeof payload }).user = payload;
    return true;
  }

  private extractToken(req: FastifyRequest): string | null {
    const auth = req.headers.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice('Bearer '.length).trim();
    }
    const cookies = (req as FastifyRequest & { cookies?: Record<string, string> }).cookies;
    if (cookies && typeof cookies.lp_access === 'string') {
      return cookies.lp_access;
    }
    return null;
  }
}
