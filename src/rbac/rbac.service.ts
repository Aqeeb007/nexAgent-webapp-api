import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../database/database.module';
import { organizationMembers } from '../database/schema/organization-members';
import { roles } from '../database/schema/roles';
import { rolePermissions } from '../database/schema/role-permissions';
import { permissions } from '../database/schema/permissions';

@Injectable()
export class RbacService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async hasPermission(
    userId: string,
    organizationId: string,
    permissionName: string,
  ): Promise<boolean> {
    const result = await this.db
      .select({
        permissionId: permissions.id,
      })
      .from(organizationMembers)
      .innerJoin(roles, eq(organizationMembers.roleId, roles.id))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.organizationId, organizationId),
          eq(permissions.name, permissionName),
        ),
      )
      .limit(1);

    return result.length > 0;
  }
}
