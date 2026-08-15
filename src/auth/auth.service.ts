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

    return this.db.transaction(async (tx) => {
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

      return { user, organization };
    });
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
}
