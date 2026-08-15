import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { organizations } from '../database/schema/organizations';
import { organizationMembers } from '../database/schema/organization-members';
import { roles } from '../database/schema/roles';
import { RolesService } from '../rbac/roles.service';
import { ROLES } from '../rbac/constants/roles';
import { OrganizationMembersService } from './organization-members.service';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly rolesService: RolesService,
    private readonly organizationMembersService: OrganizationMembersService,
  ) {}

  async create(data: { name: string }, tx?: Transaction) {
    const executor = tx ?? this.db;
    const slug = this.generateSlug(data.name);

    try {
      const [organization] = await executor
        .insert(organizations)
        .values({
          name: data.name,
          slug,
        })
        .returning({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
        });

      return organization;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Could not create organization, please try again',
        );
      }

      throw error;
    }
  }

  // Creates an organization and makes `ownerId` its owner in one place — used
  // by both registration (a user's first org) and the standalone "create
  // organization" endpoint, so this logic only exists once.
  async createOwned(name: string, ownerId: string, tx?: Transaction) {
    if (tx) {
      return this.createOwnedWith(tx, name, ownerId);
    }

    return this.db.transaction((innerTx) =>
      this.createOwnedWith(innerTx, name, ownerId),
    );
  }

  private async createOwnedWith(
    tx: Transaction,
    name: string,
    ownerId: string,
  ) {
    const organization = await this.create({ name }, tx);
    const ownerRole = await this.rolesService.findBySlugOrThrow(
      ROLES.OWNER,
      tx,
    );

    await this.organizationMembersService.addMember(
      organization.id,
      ownerId,
      ownerRole.id,
      tx,
    );

    return organization;
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  async findUserOrganizations(userId: string) {
    return this.db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: {
          id: roles.id,
          name: roles.name,
          slug: roles.slug,
        },
      })
      .from(organizationMembers)
      .innerJoin(
        organizations,
        eq(organizationMembers.organizationId, organizations.id),
      )
      .innerJoin(roles, eq(organizationMembers.roleId, roles.id))
      .where(eq(organizationMembers.userId, userId));
  }

  private generateSlug(name: string): string {
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${normalized}-${randomUUID().slice(0, 8)}`;
  }
}
