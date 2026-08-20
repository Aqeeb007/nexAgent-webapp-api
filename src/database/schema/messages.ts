import {
  bigserial,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { conversations } from './conversations';

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),

  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, {
      onDelete: 'cascade',
    }),

  role: varchar('role', {
    length: 20,
  }).notNull(),

  content: text('content').notNull(),

  toolCallData: jsonb('tool_call_data').$type<Record<string, unknown>>(),

  // Monotonic ordering key. created_at is frozen at transaction start in
  // Postgres, so rows written together (or just written fast) can tie —
  // bigserial is assigned per-INSERT regardless of transaction timing, so
  // it's what history-loading orders by, not created_at.
  sequence: bigserial('sequence', { mode: 'number' }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
