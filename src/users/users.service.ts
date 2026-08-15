import { ConflictException, Inject, Injectable } from '@nestjs/common';

import { eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';

import { users } from '../database/schema/users';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async findByEmail(email: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    return result[0] ?? null;
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    return result[0] ?? null;
  }

  async createUser(
    data: {
      email: string;
      passwordHash: string;
      firstName: string;
      lastName: string;
    },
    tx?: Transaction,
  ) {
    const executor = tx ?? this.db;

    try {
      const result = await executor
        .insert(users)
        .values({
          email: data.email.toLowerCase(),
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
        })
        .returning({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          emailVerified: users.emailVerified,
        });

      return result[0];
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Email already registered');
      }

      throw error;
    }
  }
}
