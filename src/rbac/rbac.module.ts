import { Module } from '@nestjs/common';

import { RbacService } from './rbac.service';
import { PermissionGuard } from './guards/permission.guard';
import { RbacTestController } from './rbac-test.controller';

@Module({
  providers: [RbacService, PermissionGuard],
  exports: [RbacService, PermissionGuard],
  controllers: [RbacTestController],
})
export class RbacModule {}
