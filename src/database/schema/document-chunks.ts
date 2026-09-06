import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

import { documents } from './documents';

// text-embedding-3-small dimensions — see OpenAiService.createEmbeddings.
export const EMBEDDING_DIMENSIONS = 1536;

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),

  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, {
      onDelete: 'cascade',
    }),

  chunkIndex: integer('chunk_index').notNull(),

  content: text('content').notNull(),

  embedding: vector('embedding', {
    dimensions: EMBEDDING_DIMENSIONS,
  }).notNull(),

  createdAt: timestamp('created_at').notNull().defaultNow(),
});
