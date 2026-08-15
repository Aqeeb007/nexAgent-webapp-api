import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DevAuthMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const testUserId = this.configService.get<string>('testUserId');

    if (!testUserId) {
      throw new Error('TEST_USER_ID env var is required for DevAuthMiddleware');
    }

    request.user = { id: testUserId };

    next();
  }
}
