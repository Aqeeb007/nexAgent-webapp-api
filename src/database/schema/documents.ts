import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),

  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, {
      onDelete: 'cascade',
    }),

  name: varchar('name', {
    length: 255,
  }).notNull(),

  status: varchar('status', {
    length: 20,
  }).notNull(),

  error: text('error'),

  chunkCount: integer('chunk_count').notNull().default(0),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
