import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions';

import { type Database, DATABASE } from '../database/database.module';
import { conversations } from '../database/schema/conversations';
import { messages } from '../database/schema/messages';

const CONVERSATION_COLUMNS = {
  id: conversations.id,
  agentId: conversations.agentId,
  userId: conversations.userId,
  createdAt: conversations.createdAt,
};

const MESSAGE_COLUMNS = {
  id: messages.id,
  conversationId: messages.conversationId,
  role: messages.role,
  content: messages.content,
  toolCallData: messages.toolCallData,
  sequence: messages.sequence,
  createdAt: messages.createdAt,
};

type MessageRow = typeof messages.$inferSelect;

const DEFAULT_MAX_TURNS = 20;
const PREVIEW_LENGTH = 100;

export interface AssistantToolCallData {
  toolCalls: ChatCompletionMessageToolCall[];
}

export interface ToolResultData {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface ConversationListItem {
  id: string;
  agentId: string;
  userId: string;
  createdAt: Date;
  preview: string | null;
  lastMessageAt: Date | null;
}

@Injectable()
export class ConversationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Multiple threads per (agent, user) are allowed — this always inserts a
  // new row. A double-submit legitimately creates two threads now that
  // there's no longer a single-conversation invariant to protect (same
  // posture as AgentsService.create).
  async create(agentId: string, userId: string) {
    const [conversation] = await this.db
      .insert(conversations)
      .values({ agentId, userId })
      .returning(CONVERSATION_COLUMNS);

    return conversation;
  }

  // Ownership check for a specific thread: must belong to both this agent
  // and this user, or the caller gets a 404 (not proof the id exists under
  // someone else).
  async findOwned(conversationId: string, agentId: string, userId: string) {
    const result = await this.db
      .select(CONVERSATION_COLUMNS)
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.agentId, agentId),
          eq(conversations.userId, userId),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  // List view: each thread plus a preview (first user message) and
  // lastMessageAt, computed in app code from a second query rather than a
  // SQL aggregate — matches loadHistory/loadAll's existing style, fine for
  // MVP conversation/message volumes.
  async listForUser(
    agentId: string,
    userId: string,
  ): Promise<ConversationListItem[]> {
    const threads = await this.db
      .select(CONVERSATION_COLUMNS)
      .from(conversations)
      .where(
        and(
          eq(conversations.agentId, agentId),
          eq(conversations.userId, userId),
        ),
      )
      .orderBy(desc(conversations.createdAt));

    if (threads.length === 0) {
      return [];
    }

    const threadIds = threads.map((t) => t.id);
    const allMessages = await this.db
      .select({
        conversationId: messages.conversationId,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(inArray(messages.conversationId, threadIds))
      .orderBy(asc(messages.sequence));

    const previews = new Map<string, string>();
    const lastMessageAts = new Map<string, Date>();

    for (const message of allMessages) {
      if (message.role === 'user' && !previews.has(message.conversationId)) {
        previews.set(
          message.conversationId,
          message.content.slice(0, PREVIEW_LENGTH),
        );
      }

      lastMessageAts.set(message.conversationId, message.createdAt);
    }

    return threads
      .map((thread) => ({
        ...thread,
        preview: previews.get(thread.id) ?? null,
        lastMessageAt: lastMessageAts.get(thread.id) ?? null,
      }))
      .sort(
        (a, b) =>
          (b.lastMessageAt ?? b.createdAt).getTime() -
          (a.lastMessageAt ?? a.createdAt).getTime(),
      );
  }

  async remove(conversationId: string, agentId: string, userId: string) {
    const result = await this.db
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.agentId, agentId),
          eq(conversations.userId, userId),
        ),
      )
      .returning({ id: conversations.id });

    return result[0] ?? null;
  }

  async appendMessage(
    conversationId: string,
    role: 'user' | 'assistant' | 'tool',
    content: string,
    toolCallData?: AssistantToolCallData | ToolResultData,
  ) {
    const [message] = await this.db
      .insert(messages)
      .values({
        conversationId,
        role,
        content,
        toolCallData: toolCallData as unknown as
          Record<string, unknown> | undefined,
      })
      .returning(MESSAGE_COLUMNS);

    return message;
  }

  // Loads the most recent maxTurns *turns* (a turn starts at a user-role
  // row), never cutting mid-round — a tool message whose preceding
  // assistant tool_calls got trimmed (or vice versa) makes OpenAI's API
  // reject the request. Loads the full conversation and trims in app code;
  // fine for MVP conversation sizes.
  async loadHistory(
    conversationId: string,
    maxTurns = DEFAULT_MAX_TURNS,
  ): Promise<MessageRow[]> {
    const all = await this.db
      .select(MESSAGE_COLUMNS)
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.sequence));

    let userTurnsSeen = 0;
    let startIndex = 0;

    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i].role === 'user') {
        userTurnsSeen++;
        // This user row starts the oldest turn kept so far — its own index
        // is where the slice should start (not i + 1, which would chop off
        // this turn's own user message and keep only its reply).
        startIndex = i;
        if (userTurnsSeen === maxTurns) {
          break;
        }
      }
    }

    return all.slice(startIndex);
  }

  // Full, untrimmed history for display (e.g. GET .../messages) — the
  // turn-based cap in loadHistory() is an OpenAI-context-budget concern,
  // not a UI concern.
  async loadAll(conversationId: string): Promise<MessageRow[]> {
    return this.db
      .select(MESSAGE_COLUMNS)
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.sequence));
  }
}

// Reconstructs OpenAI's expected multi-message tool-calling format from
// persisted rows. Defensively drops a trailing incomplete round (an
// assistant tool_calls message not fully answered by matching tool
// rows) — this can only happen if a process crashed mid-loop on a
// previous turn; sending it to OpenAI as-is gets a 400.
export function toOpenAiMessages(
  rows: MessageRow[],
): ChatCompletionMessageParam[] {
  const result: ChatCompletionMessageParam[] = [];
  let pendingAssistantIndex: number | null = null;
  let pendingToolCallIds: Set<string> = new Set();
  let answeredToolCallIds: Set<string> = new Set();

  const dropPendingRound = () => {
    if (pendingAssistantIndex !== null) {
      result.length = pendingAssistantIndex;
    }
    pendingAssistantIndex = null;
    pendingToolCallIds = new Set();
    answeredToolCallIds = new Set();
  };

  for (const row of rows) {
    if (row.role === 'user') {
      dropPendingRound();
      result.push({ role: 'user', content: row.content });
      continue;
    }

    if (row.role === 'assistant') {
      const toolCallData =
        row.toolCallData as unknown as AssistantToolCallData | null;

      if (toolCallData?.toolCalls?.length) {
        dropPendingRound();
        pendingAssistantIndex = result.length;
        pendingToolCallIds = new Set(toolCallData.toolCalls.map((tc) => tc.id));
        result.push({
          role: 'assistant',
          content: row.content || null,
          tool_calls: toolCallData.toolCalls,
        });
        continue;
      }

      // Plain final text — any pending round should already be complete
      // by construction; clear defensively just in case.
      pendingAssistantIndex = null;
      pendingToolCallIds = new Set();
      answeredToolCallIds = new Set();
      result.push({ role: 'assistant', content: row.content });
      continue;
    }

    if (row.role === 'tool') {
      const toolCallData = row.toolCallData as unknown as ToolResultData | null;

      if (!toolCallData?.toolCallId) {
        continue;
      }

      result.push({
        role: 'tool',
        tool_call_id: toolCallData.toolCallId,
        content: row.content,
      });
      answeredToolCallIds.add(toolCallData.toolCallId);

      if (
        pendingToolCallIds.size > 0 &&
        [...pendingToolCallIds].every((id) => answeredToolCallIds.has(id))
      ) {
        pendingAssistantIndex = null;
        pendingToolCallIds = new Set();
        answeredToolCallIds = new Set();
      }
    }
  }

  dropPendingRound();

  return result;
}
