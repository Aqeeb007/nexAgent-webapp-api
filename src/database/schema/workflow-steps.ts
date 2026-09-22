import {
  integer,
  jsonb,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { workflows } from './workflows';

export const workflowSteps = pgTable(
  'workflow_steps',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, {
        onDelete: 'cascade',
      }),

    // Display/creation-order hint only (e.g. for a steps listing UI) — NOT
    // execution order. Actual execution follows workflow_step_edges from
    // workflows.entry_step_id; see WorkflowExecutionService.
    stepOrder: integer('step_order').notNull(),

    // 'agent' | 'tool' | 'condition' — DTO-restricted via @IsIn, not a DB
    // enum, same idiom as tools.type so new step types don't need a
    // migration.
    type: varchar('type', {
      length: 50,
    }).notNull(),

    // Type-specific shape, validated at the DTO layer (validateStepConfig)
    // against the concrete config DTO for `type` — opaque to the DB, same
    // idiom as tools.config.
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),

    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('workflow_step_order_unique').on(table.workflowId, table.stepOrder),
  ],
);
