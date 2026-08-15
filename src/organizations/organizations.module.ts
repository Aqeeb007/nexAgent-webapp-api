import { Module } from '@nestjs/common';

import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationMembersService } from './organization-members.service';

import { RbacModule } from '../rbac/rbac.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [RbacModule, UsersModule],

  controllers: [OrganizationsController],

  providers: [OrganizationsService, OrganizationMembersService],

  exports: [OrganizationsService, OrganizationMembersService],
})
export class OrganizationsModule {}
