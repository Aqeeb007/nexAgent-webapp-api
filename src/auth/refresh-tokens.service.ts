import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { refreshTokens } from '../database/schema/refresh-tokens';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class RefreshTokensService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    tx?: Transaction,
  ): Promise<void> {
    const executor = tx ?? this.db;

    try {
      await executor.insert(refreshTokens).values({
        userId,
        tokenHash,
        expiresAt,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Refresh token already exists');
      }

      throw error;
    }
  }

  async findValidByHash(tokenHash: string) {
    const result = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  async revokeByHash(tokenHash: string, tx?: Transaction): Promise<void> {
    const executor = tx ?? this.db;

    await executor
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }
}
