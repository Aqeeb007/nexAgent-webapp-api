import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AccessTokenPayload } from '../token.service';
import type { AuthenticatedUser } from '../../common/types/express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  // Stateless by design: passport already verified the signature and `exp`
  // claim, so we don't re-hit the DB per request. A deleted user's access
  // token stays valid until it naturally expires — only the refresh-token
  // layer is revocable.
  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return { id: payload.sub };
  }
}
