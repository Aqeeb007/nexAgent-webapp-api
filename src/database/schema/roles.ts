import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

export const roles = pgTable('roles', {
  id: uuid('id').defaultRandom().primaryKey(),

  name: varchar('name', {
    length: 50,
  }).notNull(),

  slug: varchar('slug', {
    length: 50,
  })
    .notNull()
    .unique(),

  description: varchar('description', {
    length: 255,
  }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
