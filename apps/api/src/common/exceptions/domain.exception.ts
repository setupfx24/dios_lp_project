import { HttpException, HttpStatus } from '@nestjs/common';

import { ErrorCode, type ErrorCodeValue } from '@lp/constants';

/**
 * Base class for all application-thrown HTTP exceptions. Carries a stable
 * machine-readable `code` (from `@lp/constants`) and serializes uniformly
 * through `AllExceptionsFilter`.
 */
export class DomainException extends HttpException {
  constructor(
    public readonly code: ErrorCodeValue,
    message: string,
    status: HttpStatus,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends DomainException {
  constructor(details: Record<string, unknown>) {
    super(ErrorCode.VALIDATION_FAILED, 'Validation failed', HttpStatus.BAD_REQUEST, details);
  }
}

export class NotFoundException extends DomainException {
  constructor(resource: string, id: string) {
    super(ErrorCode.NOT_FOUND, `${resource} not found: ${id}`, HttpStatus.NOT_FOUND, {
      resource,
      id,
    });
  }
}

export class HmacRejectedException extends DomainException {
  constructor(code: ErrorCodeValue, message: string) {
    super(code, message, HttpStatus.UNAUTHORIZED);
  }
}

export class AuthForbiddenException extends DomainException {
  constructor(reason: string) {
    super(ErrorCode.AUTH_FORBIDDEN, reason, HttpStatus.FORBIDDEN);
  }
}
