import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthenticatedUser } from '../types/express';

export function currentUserFactory(
  _data: unknown,
  ctx: ExecutionContext,
): AuthenticatedUser {
  const user = ctx.switchToHttp().getRequest<Request>().user;

  if (!user) {
    throw new UnauthorizedException();
  }

  return user;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
