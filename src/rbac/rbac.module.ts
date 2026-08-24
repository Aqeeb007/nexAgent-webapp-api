import { Module } from '@nestjs/common';

import { RbacService } from './rbac.service';
import { RolesService } from './roles.service';
import { PermissionGuard } from './guards/permission.guard';

@Module({
  providers: [RbacService, RolesService, PermissionGuard],
  exports: [RbacService, RolesService, PermissionGuard],
})
export class RbacModule {}
