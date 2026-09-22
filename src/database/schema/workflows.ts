import {
  type AnyPgColumn,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { workflowSteps } from './workflow-steps';

export const workflows = pgTable('workflows', {
  id: uuid('id').defaultRandom().primaryKey(),

  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, {
      onDelete: 'cascade',
    }),

  name: varchar('name', {
    length: 255,
  }).notNull(),

  description: text('description'),

  // Where graph execution starts. Nullable — no steps exist at workflow
  // creation time; WorkflowsService.addStep sets this automatically for a
  // workflow's first step. `set null` (not cascade) so deleting the entry
  // step clears the pointer instead of deleting the whole workflow, same
  // idiom as users.last_active_organization_id.
  entryStepId: uuid('entry_step_id').references(
    (): AnyPgColumn => workflowSteps.id,
    { onDelete: 'set null' },
  ),

  createdAt: timestamp('created_at').notNull().defaultNow(),

  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
