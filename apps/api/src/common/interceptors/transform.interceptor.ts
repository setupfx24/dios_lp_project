import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';

import type { FastifyRequest } from 'fastify';

interface SuccessEnvelope<T> {
  success: true;
  data: T;
  requestId: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<SuccessEnvelope<T>> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? req.id;

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        data,
        requestId,
      })),
    );
  }
}
