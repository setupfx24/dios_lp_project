import { Injectable, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

import { ValidationException } from '../exceptions/domain.exception.js';

/**
 * Per-handler Zod validation pipe. Apply via:
 *
 *   @UsePipes(new ZodValidationPipe(orderRequestSchema))
 *
 * On success the controller receives the parsed (and sometimes transformed)
 * value typed via `z.infer<typeof schema>`.
 */
@Injectable()
export class ZodValidationPipe<TIn = unknown, TOut = TIn> implements PipeTransform<TIn, TOut> {
  constructor(private readonly schema: ZodSchema<TOut>) {}

  transform(value: TIn): TOut {
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
