import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../../common/exceptions/domain.exception.js';

import { ADMIN_ROLES_KEY, type AdminRoleName } from './admin-decorators.js';

import type { AdminRequestContext } from './admin-context.js';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRoleName[] | undefined>(
      ADMIN_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { adminCtx?: AdminRequestContext }>();
    const role = req.adminCtx?.user.adminRole;
    if (!role || !required.includes(role)) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        `Requires admin role in [${required.join(', ')}]`,
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
