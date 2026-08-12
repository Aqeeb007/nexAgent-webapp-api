import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { REQUIRED_PERMISSION_KEY } from '../decorators/require-permission.decorator';

import { RbacService } from '../rbac.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<string>(
      REQUIRED_PERMISSION_KEY,
      context.getHandler(),
    );

    // No permission required
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    const user = request.user;

    if (!user) {
      throw new UnauthorizedException();
    }

    const organizationId = request.headers['x-organization-id'];

    if (!organizationId || Array.isArray(organizationId)) {
      throw new ForbiddenException('Organization context is required');
    }

    const allowed = await this.rbacService.hasPermission(
      user.id,
      organizationId,
      permission,
    );

    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
