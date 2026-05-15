import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { UserRole } from '@lp/types';
import type { FastifyRequest } from 'fastify';

export interface CurrentUserPayload {
  readonly userId: string;
  readonly email: string;
  readonly role: UserRole;
  readonly brokerId: string | null;
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): CurrentUserPayload | null => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user?: CurrentUserPayload }>();
    return req.user ?? null;
  },
);

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator => {
  return ((target: object, _key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      Reflect.defineMetadata(ROLES_KEY, roles, descriptor.value as object);
      return descriptor;
    }
    Reflect.defineMetadata(ROLES_KEY, roles, target);
    return target;
  }) as MethodDecorator & ClassDecorator;
};
