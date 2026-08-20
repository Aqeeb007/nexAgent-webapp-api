import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { users } from './users';

export const conversations = pgTable(
  'conversations',
  {
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
  },
  (table) => [
    // One conversation per (agent, user) for MVP — also closes a
    // double-submit race in find-or-create (see ConversationsService).
    unique('conversation_agent_user_unique').on(table.agentId, table.userId),
  ],
);
