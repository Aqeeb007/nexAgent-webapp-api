import { pgTable, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

import { workflows } from './workflows';
import { workflowSteps } from './workflow-steps';

export const workflowStepEdges = pgTable(
  'workflow_step_edges',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, {
        onDelete: 'cascade',
      }),

    fromStepId: uuid('from_step_id')
      .notNull()
      .references(() => workflowSteps.id, {
        onDelete: 'cascade',
      }),

    toStepId: uuid('to_step_id')
      .notNull()
      .references(() => workflowSteps.id, {
        onDelete: 'cascade',
      }),

    // Always a real string, never null — Postgres unique constraints treat
    // every NULL as distinct, so a nullable branch couldn't stop two
    // unconditional edges from the same step. 'default' is the literal
    // label for a non-condition step's one outgoing edge; a condition
    // step's edges are branched by its config.cases[].branch values.
    branch: varchar('branch', { length: 50 }).notNull().default('default'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('workflow_step_edge_branch_unique').on(
      table.fromStepId,
      table.branch,
    ),
  ],
);
