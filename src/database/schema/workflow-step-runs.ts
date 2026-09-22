import {
  bigserial,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { workflowRuns } from './workflow-runs';
import { workflowSteps } from './workflow-steps';

export const workflowStepRuns = pgTable('workflow_step_runs', {
  id: uuid('id').defaultRandom().primaryKey(),

  workflowRunId: uuid('workflow_run_id')
    .notNull()
    .references(() => workflowRuns.id, {
      onDelete: 'cascade',
    }),

  workflowStepId: uuid('workflow_step_id')
    .notNull()
    .references(() => workflowSteps.id, {
      onDelete: 'cascade',
    }),

  // Monotonic ordering key, same reasoning as messages.sequence — step runs
  // within one workflow run are written fast in a loop, so created_at can
  // tie; bigserial is assigned per-INSERT regardless.
  sequence: bigserial('sequence', { mode: 'number' }),

  // 'success' | 'failed' | 'skipped'
  status: varchar('status', {
    length: 20,
  }).notNull(),

  input: jsonb('input').$type<Record<string, unknown>>(),

  output: jsonb('output').$type<Record<string, unknown>>(),

  error: text('error'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
