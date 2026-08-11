import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';
import { organizations } from './organizations';

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, {
      onDelete: 'cascade',
    }),

  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, {
      onDelete: 'cascade',
    }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
