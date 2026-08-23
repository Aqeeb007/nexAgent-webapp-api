import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

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

  // Nullable: Phase 3 rows predate these. New tools require both at the DTO
  // layer (see CreateToolDto) — needed to build an OpenAI function
  // definition (name/description/parameters) for chat tool-calling.
  description: text('description'),

  parameters: jsonb('parameters').$type<Record<string, unknown>>(),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
