import 'dotenv/config';

import { eq, inArray } from 'drizzle-orm';

import { db } from './database';

import { permissions } from './schema/permissions';
import { roles } from './schema/roles';
import { rolePermissions } from './schema/role-permissions';

import { PERMISSIONS } from '../rbac/constants/permissions';
import { ROLES } from '../rbac/constants/roles';

import { ROLE_PERMISSIONS } from '../rbac/constants/rbac.seed';

async function seed() {
  console.log('🌱 Seeding database...');

  // 1. Seed permissions
  const permissionValues = Object.values(PERMISSIONS).map((name) => {
    const [resource, action] = name.split(':');

    return {
      name,
      resource,
      action,
    };
  });

  await db.insert(permissions).values(permissionValues).onConflictDoNothing();

  // 2. Seed roles
  await db
    .insert(roles)
    .values([
      {
        name: 'Owner',
        slug: ROLES.OWNER,
        description: 'Organization owner',
      },
      {
        name: 'Admin',
        slug: ROLES.ADMIN,
        description: 'Organization administrator',
      },
      {
        name: 'Member',
        slug: ROLES.MEMBER,
        description: 'Organization member',
      },
    ])
    .onConflictDoNothing();

  // 3. Fetch database IDs
  const roleRows = await db
    .select()
    .from(roles)
    .where(inArray(roles.slug, [ROLES.OWNER, ROLES.ADMIN, ROLES.MEMBER]));

  const permissionRows = await db
    .select()
    .from(permissions)
    .where(inArray(permissions.name, Object.values(PERMISSIONS)));

  // 4. Convert to lookup maps
  const roleMap = new Map(roleRows.map((role) => [role.slug, role.id]));

  const permissionMap = new Map(
    permissionRows.map((permission) => [permission.name, permission.id]),
  );

  // 5. Build role → permission relationships
  const rolePermissionValues = Object.entries(ROLE_PERMISSIONS).flatMap(
    ([roleName, permissionNames]) => {
      const roleId = roleMap.get(roleName);

      if (!roleId) {
        throw new Error(`Role not found: ${roleName}`);
      }

      return permissionNames.map((permissionName) => {
        const permissionId = permissionMap.get(permissionName);

        if (!permissionId) {
          throw new Error(`Permission not found: ${permissionName}`);
        }

        return {
          roleId,
          permissionId,
        };
      });
    },
  );

  // 6. Insert relationships
  await db
    .insert(rolePermissions)
    .values(rolePermissionValues)
    .onConflictDoNothing();

  console.log('✅ RBAC seed completed');

  process.exit(0);
}

seed().catch((error) => {
  console.error('❌ RBAC seed failed', error);
  process.exit(1);
});
