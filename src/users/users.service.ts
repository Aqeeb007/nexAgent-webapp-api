import { ConflictException, Inject, Injectable } from '@nestjs/common';

import { eq } from 'drizzle-orm';

import { DATABASE } from '../database/database.module';

import { users } from '../database/schema/users';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DATABASE)
    private readonly db: any,
  ) {}

  async findByEmail(email: string) {
    const result = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
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

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }) {
    const existingUser = await this.findByEmail(data.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const result = await this.db
      .insert(users)
      .values({
        email: data.email,
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
  }
}
