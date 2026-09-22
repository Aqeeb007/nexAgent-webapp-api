import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

// Append-only ledger, never mutated — one row per billable event, same
// insert-only posture as `messages`. No plan/limit enforcement yet (see
// docs/BILLING_USAGE.md) — this table exists purely so usage is captured
// now and can be aggregated/charged against later without backfilling.
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, {
        onDelete: 'cascade',
      }),

    // 'chat_completion' | 'embedding' | 'tool_execution' — see
    // src/usage/constants/usage-event-types.ts. Plain varchar, not a DB
    // enum, so a new event type needs no migration (same posture as
    // tools.type).
    eventType: varchar('event_type', { length: 30 }).notNull(),

    // Tokens for chat_completion/embedding, call count (1) for
    // tool_execution.
    quantity: integer('quantity').notNull(),

    metadata: jsonb('metadata').$type<Record<string, unknown>>(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('usage_events_org_created_idx').on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);
