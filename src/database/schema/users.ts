import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

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

  // Which org to land the user in on their next login. Nullable, and
  // deliberately `onDelete: 'set null'` rather than the usual cascade — losing
  // this org membership should clear the pointer, not delete the user.
  lastActiveOrganizationId: uuid('last_active_organization_id').references(
    () => organizations.id,
    { onDelete: 'set null' },
  ),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
