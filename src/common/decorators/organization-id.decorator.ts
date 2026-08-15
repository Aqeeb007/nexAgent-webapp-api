import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';

export function organizationIdFactory(
  _data: unknown,
  ctx: ExecutionContext,
): string {
  const organizationId = ctx.switchToHttp().getRequest<Request>().headers[
    'x-organization-id'
  ];

  if (!organizationId || Array.isArray(organizationId)) {
    throw new ForbiddenException('Organization context is required');
  }

  return organizationId;
}

export const OrganizationId = createParamDecorator(organizationIdFactory);
