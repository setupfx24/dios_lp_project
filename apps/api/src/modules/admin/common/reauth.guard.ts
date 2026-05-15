import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as argon2 from 'argon2';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../../common/exceptions/domain.exception.js';

import { REQUIRE_REAUTH_KEY } from './admin-decorators.js';

import type { AdminRequestContext } from './admin-context.js';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class ReauthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_REAUTH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { adminCtx?: AdminRequestContext }>();
    const ctx = req.adminCtx;
    if (!ctx) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Admin context missing',
        HttpStatus.FORBIDDEN,
      );
    }
    const token = req.headers['x-reauth-token'];
    if (typeof token !== 'string' || token.length === 0) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Reauth token required for this action',
        HttpStatus.FORBIDDEN,
      );
    }
    if (
      !ctx.session.reauthTokenHash ||
      !ctx.session.reauthValidUntil ||
      ctx.session.reauthValidUntil.getTime() <= Date.now()
    ) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Reauth token expired or absent',
        HttpStatus.FORBIDDEN,
      );
    }
    const ok = await argon2.verify(ctx.session.reauthTokenHash, token);
    if (!ok) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        'Reauth token invalid',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
