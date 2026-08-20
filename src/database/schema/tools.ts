import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const tools = pgTable('tools', {
  id: uuid('id').defaultRandom().primaryKey(),

  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, {
      onDelete: 'cascade',
    }),

  name: varchar('name', {
    length: 255,
  }).notNull(),

  type: varchar('type', {
    length: 50,
  }).notNull(),

  config: jsonb('config').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
