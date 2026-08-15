import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { type Database, DATABASE } from '../database/database.module';
import { users } from '../database/schema/users';
import { eq } from 'drizzle-orm';
import { organizations } from '../database/schema/organizations';
import { roles } from '../database/schema/roles';
import { organizationMembers } from '../database/schema/organization-members';

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}
  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const result = await this.db.transaction(async (tx) => {
      // 1. Check email
      const existingUser = await tx
        .select({
          id: users.id,
        })
        .from(users)
        .where(eq(users.email, dto.email.toLowerCase()))
        .limit(1);

      if (existingUser.length > 0) {
        throw new ConflictException('Email already registered');
      }

      // 2. Create user
      const [user] = await tx
        .insert(users)
        .values({
          email: dto.email.toLowerCase(),
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
        });

      // 3. Create organization
      const slug = this.createOrganizationSlug(dto.firstName);

      const [organization] = await tx
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

      // 4. Find owner role
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

      // 5. Create membership
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

  findAll() {
    return `This action returns all auth`;
  }

  findOne(id: number) {
    return `This action returns a #${id} auth`;
  }

  update(id: number, loginDto: LoginDto) {
    return `This action updates a #${id} auth`;
  }

  remove(id: number) {
    return `This action removes a #${id} auth`;
  }

  private createOrganizationSlug(firstName: string): string {
    const normalized = firstName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${normalized}-${crypto.randomUUID().slice(0, 8)}`;
  }
}
