import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, {
      onDelete: 'cascade',
    }),

  tokenHash: varchar('token_hash', {
    length: 255,
  })
    .notNull()
    .unique(),

  expiresAt: timestamp('expires_at').notNull(),

  revokedAt: timestamp('revoked_at'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
