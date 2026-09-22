import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
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
import { UsersService } from '../users/users.service';
import { TokenService } from './token.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { OrganizationsService } from '../organizations/organizations.service';

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

interface UserWithLastActiveOrganization {
  id: string;
  lastActiveOrganizationId: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly organizationsService: OrganizationsService,
  ) {}
  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    const { user, organization } = await this.db.transaction(async (tx) => {
      // DB unique constraint on email is the source of truth; usersService
      // .createUser turns a conflicting insert into a ConflictException.
      const user = await this.usersService.createUser(
        {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        tx,
      );

      const organization = await this.organizationsService.createOwned(
        `${dto.firstName}'s Organization`,
        user.id,
        tx,
      );

      await this.usersService.updateLastActiveOrganization(
        user.id,
        organization.id,
        tx,
      );

      return { user, organization };
    });

    // The frontend treats a successful register the same as a login (it
    // redirects straight into the app), so register must hand back the same
    // token-pair shape login() does — not just the created rows. That
    // includes `organizationId`, alongside the full `organization` object,
    // so the frontend can seed its org selection the same way for both
    // register and login instead of special-casing one of them.
    const tokens = await this.issueTokenPair(user);

    return { ...tokens, user, organization, organizationId: organization.id };
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
    const organizationId = await this.resolveActiveOrganizationId(user);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified,
      },
      organizationId,
    };
  }

  // Picks which org the frontend should open the user into: the org they were
  // last active in, if they're still a member of it, otherwise their
  // longest-standing membership (findUserOrganizations is ordered by
  // membership age so this is deterministic, not "whatever Postgres felt like
  // returning first").
  private async resolveActiveOrganizationId(
    user: UserWithLastActiveOrganization,
  ): Promise<string | null> {
    const memberships = await this.organizationsService.findUserOrganizations(
      user.id,
    );

    if (memberships.length === 0) {
      return null;
    }

    const lastActiveStillValid = memberships.some(
      (membership) => membership.id === user.lastActiveOrganizationId,
    );

    if (user.lastActiveOrganizationId && lastActiveStillValid) {
      return user.lastActiveOrganizationId;
    }

    return memberships[0].id;
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
}
