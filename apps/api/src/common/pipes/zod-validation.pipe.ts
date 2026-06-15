import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

import { ValidationException } from '../exceptions/domain.exception.js';

/**
 * Per-handler Zod validation pipe. Apply via:
 *
 *   @UsePipes(new ZodValidationPipe(orderRequestSchema))
 *
 * On success the controller receives the parsed (and sometimes transformed)
 * value typed via `z.infer<typeof schema>`.
 *
 * `@UsePipes` applies a pipe to EVERY parameter of the handler. Custom param
 * decorators (e.g. `@AdminCtx()`, `@CurrentUser()`) resolve to non-DTO objects
 * that must not be run through the body/query schema — skip them so the schema
 * only validates the actual `@Body()` / `@Query()` / `@Param()` argument.
 */
@Injectable()
export class ZodValidationPipe<TIn = unknown, TOut = TIn> implements PipeTransform<TIn, TOut> {
  constructor(private readonly schema: ZodSchema<TOut>) {}

  transform(value: TIn, metadata?: ArgumentMetadata): TOut {
    if (metadata && metadata.type === 'custom') {
      return value as unknown as TOut;
    }
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new ValidationException({ issues: err.issues });
      }
      throw err;
    }
  }
}
