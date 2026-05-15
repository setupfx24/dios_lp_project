import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { tap, type Observable } from 'rxjs';

import type { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const start = process.hrtime.bigint();
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
          this.logger.log(
            `${req.method} ${req.url} -> ${reply.statusCode} (${durationMs.toFixed(1)}ms)`,
          );
        },
        error: (err: Error) => {
          const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
          this.logger.warn(
            `${req.method} ${req.url} threw ${err.name} (${durationMs.toFixed(1)}ms)`,
          );
        },
      }),
    );
  }
}
