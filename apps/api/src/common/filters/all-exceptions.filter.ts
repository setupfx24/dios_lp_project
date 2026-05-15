import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ZodError } from 'zod';

import { ErrorCode } from '@lp/constants';

import { DomainException } from '../exceptions/domain.exception.js';

import type { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest>();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? req.id;

    const { status, body } = this.toResponse(exception);

    if (status >= 500) {
      this.logger.error(
        { err: exception, requestId, path: req.url, method: req.method },
        body.message,
      );
    }

    void reply.status(status).send({
      success: false,
      error: body,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }

  private toResponse(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof DomainException) {
      const resp = exception.getResponse() as {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
      const body: ErrorBody = { code: resp.code, message: resp.message };
      if (resp.details !== undefined) {
        body.details = resp.details;
      }
      return { status: exception.getStatus(), body };
    }
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          details: { issues: exception.issues },
        },
      };
    }
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      const message =
        typeof resp === 'string'
          ? resp
          : ((resp as { message?: string }).message ?? exception.message);
      return {
        status: exception.getStatus(),
        body: {
          code: this.statusToCode(exception.getStatus()),
          message,
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ErrorCode.INTERNAL_ERROR, message: 'Internal server error' },
    };
  }

  private statusToCode(status: number): string {
    switch (status as HttpStatus) {
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.AUTH_TOKEN_INVALID;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.AUTH_FORBIDDEN;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }
}
