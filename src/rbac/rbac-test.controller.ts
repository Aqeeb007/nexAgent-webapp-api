import { Controller, Get, Req, UseGuards } from '@nestjs/common';

import type { Request } from 'express';

import { PermissionGuard } from './guards/permission.guard';
import { RequirePermission } from './decorators/require-permission.decorator';

@Controller('rbac-test')
@UseGuards(PermissionGuard)
export class RbacTestController {
  @Get('agent-read')
  @RequirePermission('agent:read')
  testAgentRead(@Req() request: Request) {
    return {
      success: true,
      message: 'You have agent:read permission',
    };
  }

  @Get('agent-delete')
  @RequirePermission('agent:delete')
  testAgentDelete(@Req() request: Request) {
    return {
      success: true,
      message: 'You have agent:delete permission',
    };
  }
}
