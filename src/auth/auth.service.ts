import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import * as bcrypt from 'bcrypt';
import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { eq } from 'drizzle-orm';
import { organizations } from '../database/schema/organizations';
import { roles } from '../database/schema/roles';
import { organizationMembers } from '../database/schema/organization-members';
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

// Fixed, non-secret bcrypt hash (cost 12) used only to equalize bcrypt.compare()
// timing when no user is found, so "unknown email" and "known email, wrong
// password" take the same time — otherwise the missing compare() call is a
// timing side-channel that leaks whether an email is registered.
const DUMMY_PASSWORD_HASH =
  '$2b$12$LjSaNXS2DDNczi9P.kNzXuSOahN8B8qyKYNHbEkYuHhW8yp0lQ7fq';

interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly refreshTokensService: RefreshTokensService,
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

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);

    // Always run bcrypt.compare, even with no user, against a dummy hash so
    // "unknown email" and "wrong password" take the same amount of time.
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.issueTokenPair(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
    };
  }

  async refresh(dto: RefreshTokenDto) {
    const payload = await this.tokenService.verifyRefreshToken(
      dto.refreshToken,
    );
    const tokenHash = this.tokenService.hashToken(dto.refreshToken);

    const storedToken =
      await this.refreshTokensService.findValidByHash(tokenHash);

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.db.transaction(async (tx) => {
      await this.refreshTokensService.revokeByHash(tokenHash, tx);

      return this.issueTokenPair(user, tx);
    });
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const tokenHash = this.tokenService.hashToken(dto.refreshToken);

    await this.refreshTokensService.revokeByHash(tokenHash);
  }

  private async issueTokenPair(user: AuthenticatedUser, tx?: Transaction) {
    const accessToken = await this.tokenService.signAccessToken({
      sub: user.id,
      email: user.email,
    });

    const refreshToken = await this.tokenService.signRefreshToken({
      sub: user.id,
      jti: randomUUID(),
    });

    const tokenHash = this.tokenService.hashToken(refreshToken);
    const expiresAt = this.tokenService.decodeExpiry(refreshToken);

    await this.refreshTokensService.create(user.id, tokenHash, expiresAt, tx);

    return { accessToken, refreshToken };
  }

  private createOrganizationSlug(firstName: string): string {
    const normalized = firstName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return `${normalized}-${randomUUID().slice(0, 8)}`;
  }
}
