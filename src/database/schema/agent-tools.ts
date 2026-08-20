import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { organizations } from './organizations';
import { tools } from './tools';

export const agentTools = pgTable(
  'agent_tools',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),

    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, {
        onDelete: 'cascade',
      }),

    toolId: uuid('tool_id')
      .notNull()
      .references(() => tools.id, {
        onDelete: 'cascade',
      }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [unique('agent_tool_unique').on(table.agentId, table.toolId)],
);
