import { pgTable, uuid, varchar, text } from 'drizzle-orm/pg-core';

export const permissions = pgTable('permissions', {
  id: uuid('id').defaultRandom().primaryKey(),

  name: varchar('name', {
    length: 100,
  })
    .notNull()
    .unique(),

  resource: varchar('resource', {
    length: 50,
  }).notNull(),

  action: varchar('action', {
    length: 50,
  }).notNull(),

  description: text('description'),
});
