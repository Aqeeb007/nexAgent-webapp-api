import { jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';
import { workflows } from './workflows';

export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').defaultRandom().primaryKey(),

  workflowId: uuid('workflow_id')
    .notNull()
    .references(() => workflows.id, {
      onDelete: 'cascade',
    }),

  triggeredByUserId: uuid('triggered_by_user_id')
    .notNull()
    .references(() => users.id, {
      onDelete: 'cascade',
    }),

  // 'running' | 'completed' | 'failed'
  status: varchar('status', {
    length: 20,
  }).notNull(),

  input: jsonb('input').$type<Record<string, unknown>>(),

  output: jsonb('output').$type<Record<string, unknown>>(),

  error: text('error'),

  startedAt: timestamp('started_at').notNull().defaultNow(),

  completedAt: timestamp('completed_at'),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
