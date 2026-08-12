import { Injectable, NestMiddleware } from '@nestjs/common';

import { Request, Response, NextFunction } from 'express';

@Injectable()
export class DevAuthMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const testUserId = process.env.TEST_USER_ID;

    if (!testUserId) {
      throw new Error('TEST_USER_ID env var is required for DevAuthMiddleware');
    }

    request.user = { id: testUserId };

    next();
  }
}
