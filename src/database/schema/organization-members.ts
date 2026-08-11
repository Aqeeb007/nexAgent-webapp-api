import {
  pgTable,
  timestamp,
  uuid,
  unique,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { organizations } from './organizations';
import { roles } from './roles';

export const organizationMembers = pgTable(
  'organization_members',
  {
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

    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),

    createdAt: timestamp('created_at')
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('user_organization_unique').on(
      table.userId,
      table.organizationId,
    ),
  ],
);
