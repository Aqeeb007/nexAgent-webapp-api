import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { type Database, DATABASE } from '../database/database.module';
import { usageEvents } from '../database/schema/usage-events';

import { USAGE_EVENT_TYPES, type UsageEventType } from './constants/usage-event-types';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Recording rides along after an already-successful OpenAI/tool call —
  // it must never fail the request it's measuring, so a write failure here
  // is logged and swallowed rather than propagated, same posture as the
  // RAG-retrieval-degrades-gracefully handling in ChatService.
  async record(
    organizationId: string,
    eventType: UsageEventType,
    quantity: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(usageEvents).values({
        organizationId,
        eventType,
        quantity,
        metadata,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to record usage event "${eventType}" for org ${organizationId}: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }

  // Totals per event type since `since` — no billing-period concept yet
  // (see docs/BILLING_USAGE.md), so the caller decides what window "since"
  // means.
  async summary(organizationId: string, since: Date) {
    return this.db
      .select({
        eventType: usageEvents.eventType,
        totalQuantity: sql<number>`sum(${usageEvents.quantity})`.mapWith(
          Number,
        ),
        eventCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, organizationId),
          gte(usageEvents.createdAt, since),
        ),
      )
      .groupBy(usageEvents.eventType);
  }

  // Per-agent breakdown — agentId lives in `metadata` (chat_completion,
  // embedding with source: 'rag_query', and tool_execution all set it), not
  // as a column, since usage_events has no FK to agents: an agent can be
  // deleted while its historical usage rows stay (same "no dangling FK"
  // posture as other org-scoped tables that reach agents only through a
  // join elsewhere). Document-upload embeddings have no agentId at all — a
  // document is an org-level resource attachable to multiple agents, so
  // that cost isn't attributable to one — those rows come back with
  // `agentId: null` rather than being dropped; the caller decides how to
  // label them (e.g. "Unassigned").
  async summaryByAgent(organizationId: string, since: Date) {
    return this.db
      .select({
        agentId: sql<string | null>`${usageEvents.metadata}->>'agentId'`,
        eventType: usageEvents.eventType,
        totalQuantity: sql<number>`sum(${usageEvents.quantity})`.mapWith(
          Number,
        ),
        eventCount: sql<number>`count(*)`.mapWith(Number),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, organizationId),
          gte(usageEvents.createdAt, since),
        ),
      )
      .groupBy(
        sql`${usageEvents.metadata}->>'agentId'`,
        usageEvents.eventType,
      );
  }

  // Daily total tokens for a dashboard trend line — chat_completion and
  // embedding summed together (both are token counts; tool_execution is a
  // call count and stays out, same one-axis reasoning as UsageTokenChart on
  // the Usage page). One row per day that had at least one event, ordered
  // oldest first so the chart doesn't need to re-sort.
  async dailyTokenSeries(organizationId: string, since: Date) {
    const day = sql`date_trunc('day', ${usageEvents.createdAt})`;

    return this.db
      .select({
        day: sql<string>`to_char(${day}, 'YYYY-MM-DD')`,
        totalTokens: sql<number>`sum(${usageEvents.quantity})`.mapWith(
          Number,
        ),
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.organizationId, organizationId),
          gte(usageEvents.createdAt, since),
          inArray(usageEvents.eventType, [
            USAGE_EVENT_TYPES.CHAT_COMPLETION,
            USAGE_EVENT_TYPES.EMBEDDING,
          ]),
        ),
      )
      .groupBy(day)
      .orderBy(day);
  }
}
