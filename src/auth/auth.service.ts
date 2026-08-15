import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { type Database, DATABASE } from '../database/database.module';
import { eq } from 'drizzle-orm';
import { organizations } from '../database/schema/organizations';
import { roles } from '../database/schema/roles';
import { organizationMembers } from '../database/schema/organization-members';
import { UsersService } from '../users/users.service';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersService: UsersService,
  ) {}
  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.db.transaction(async (tx) => {
      // 1. Create user (DB unique constraint on email is the source of truth;
      // usersService.createUser turns a conflicting insert into a ConflictException)
      const user = await this.usersService.createUser(
        {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        tx,
      );

      // 2. Create organization
      const slug = this.createOrganizationSlug(dto.firstName);

      let organization: { id: string; name: string; slug: string };
      try {
        [organization] = await tx
          .insert(organizations)
          .values({
            name: `${dto.firstName}'s Organization`,
            slug,
          })
          .returning({
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
          });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException(
            'Could not create organization, please try again',
          );
        }

        throw error;
      }

      // 3. Find owner role
      const [ownerRole] = await tx
        .select({
          id: roles.id,
        })
        .from(roles)
        .where(eq(roles.slug, 'owner'))
        .limit(1);

      if (!ownerRole) {
        throw new InternalServerErrorException('Owner role is not configured');
      }

      // 4. Create membership
      await tx.insert(organizationMembers).values({
        userId: user.id,
        organizationId: organization.id,
        roleId: ownerRole.id,
      });

      return {
        user,
        organization,
      };
    });

    return result;
  }

  private createOrganizationSlug(firstName: string): string {
    const normalized = firstName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${normalized}-${randomUUID().slice(0, 8)}`;
  }
}
