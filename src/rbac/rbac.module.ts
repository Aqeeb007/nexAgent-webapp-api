import { Module } from '@nestjs/common';

import { RbacService } from './rbac.service';
import { RolesService } from './roles.service';
import { PermissionGuard } from './guards/permission.guard';
import { RbacTestController } from './rbac-test.controller';

@Module({
  providers: [RbacService, RolesService, PermissionGuard],
  exports: [RbacService, RolesService, PermissionGuard],
  controllers: [RbacTestController],
})
export class RbacModule {}
