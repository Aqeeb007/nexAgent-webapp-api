import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),

  email: varchar('email', {
    length: 255,
  })
    .notNull()
    .unique(),

  passwordHash: varchar('password_hash', {
    length: 255,
  }).notNull(),

  firstName: varchar('first_name', {
    length: 100,
  }).notNull(),

  lastName: varchar('last_name', {
    length: 100,
  }).notNull(),

  emailVerified: boolean('email_verified').notNull().default(false),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
