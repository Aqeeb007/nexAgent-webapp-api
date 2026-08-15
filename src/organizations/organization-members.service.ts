import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { organizationMembers } from '../database/schema/organization-members';
import { users } from '../database/schema/users';
import { roles } from '../database/schema/roles';
import { UsersService } from '../users/users.service';
import { RolesService } from '../rbac/roles.service';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class OrganizationMembersService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
  ) {}

  async addMember(
    organizationId: string,
    userId: string,
    roleId: string,
    tx?: Transaction,
  ) {
    const executor = tx ?? this.db;

    try {
      const [membership] = await executor
        .insert(organizationMembers)
        .values({
          organizationId,
          userId,
          roleId,
        })
        .returning({
          id: organizationMembers.id,
          organizationId: organizationMembers.organizationId,
          userId: organizationMembers.userId,
          roleId: organizationMembers.roleId,
        });

      return membership;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'User is already a member of this organization',
        );
      }

      throw error;
    }
  }

  // The actual "add member" orchestration: look up the account by email,
  // resolve the requested role, then create the membership. Direct-by-email
  // only — no invite token, no email sent (see ROADMAP.md for the deferred
  // token-based invite flow).
  async addMemberByEmail(
    organizationId: string,
    email: string,
    roleSlug: string,
    tx?: Transaction,
  ) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new NotFoundException(
        'No account found for that email — they need to register first',
      );
    }

    const role = await this.rolesService.findBySlugOrThrow(roleSlug, tx);

    return this.addMember(organizationId, user.id, role.id, tx);
  }

  async listMembers(organizationId: string) {
    return this.db
      .select({
        id: organizationMembers.id,
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: {
          id: roles.id,
          name: roles.name,
          slug: roles.slug,
        },
        joinedAt: organizationMembers.createdAt,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(organizationMembers.userId, users.id))
      .innerJoin(roles, eq(organizationMembers.roleId, roles.id))
      .where(eq(organizationMembers.organizationId, organizationId));
  }
}
