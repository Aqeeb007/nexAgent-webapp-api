import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),

  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, {
      onDelete: 'cascade',
    }),

  name: varchar('name', {
    length: 255,
  }).notNull(),

  description: text('description'),

  systemPrompt: text('system_prompt').notNull(),

  model: varchar('model', {
    length: 100,
  }).notNull(),

  configuration: jsonb('configuration').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
