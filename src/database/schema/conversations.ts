import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { users } from './users';

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),

  agentId: uuid('agent_id')
    .notNull()
    .references(() => agents.id, {
      onDelete: 'cascade',
    }),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, {
      onDelete: 'cascade',
    }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
