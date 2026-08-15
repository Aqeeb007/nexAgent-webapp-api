import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Uses the module-default secret/TTL (jwt.accessSecret / jwt.accessExpiresIn).
  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload);
  }

  signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: this.configService.get<string>(
        'jwt.refreshExpiresIn',
      ) as JwtSignOptions['expiresIn'],
    });
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  // SHA-256, not bcrypt: the token is already high-entropy (signed JWT), so we
  // need a fast, deterministic digest for an exact-match DB lookup, not a slow
  // salted hash meant to protect a low-entropy user-chosen secret.
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  decodeExpiry(token: string): Date {
    const decoded = this.jwtService.decode<{ exp?: number }>(token);

    if (!decoded?.exp) {
      throw new InternalServerErrorException(
        'Issued token is missing an expiry claim',
      );
    }

    return new Date(decoded.exp * 1000);
  }
}
