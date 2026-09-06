import { pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { agents } from './agents';
import { documents } from './documents';
import { organizations } from './organizations';

export const agentDocuments = pgTable(
  'agent_documents',
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

    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, {
        onDelete: 'cascade',
      }),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('agent_document_unique').on(table.agentId, table.documentId),
  ],
);
