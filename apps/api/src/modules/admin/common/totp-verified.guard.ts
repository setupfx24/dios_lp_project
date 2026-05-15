import {
  HttpStatus,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../../../common/exceptions/domain.exception.js';

import type { AdminRequestContext } from './admin-context.js';
import type { FastifyRequest } from 'fastify';

export const ALLOW_NO_TOTP_KEY = 'admin:allow-no-totp';

/**
 * Endpoints exempt from the 2FA requirement (login, 2FA setup, recovery).
 * Tag with `@SkipTotpVerified()` to opt out.
 */
export const SkipTotpVerified = () => SetMetadata(ALLOW_NO_TOTP_KEY, true);

@Injectable()
export class TotpVerifiedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_NO_TOTP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
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
    if (!ctx.session.totpVerifiedAt) {
      throw new DomainException(
        ErrorCode.AUTH_FORBIDDEN,
        '2FA verification required for this session',
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
