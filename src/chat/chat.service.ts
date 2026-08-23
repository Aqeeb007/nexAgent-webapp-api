import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChatCompletionMessage,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

import { AgentsService } from '../agents/agents.service';
import { AgentToolsService } from '../agent-tools/agent-tools.service';
import { ToolsService } from '../tools/tools.service';
import {
  OpenAiService,
  type AgentConfiguration,
} from '../openai/openai.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/constants/permissions';

import {
  ConversationsService,
  toOpenAiMessages,
} from './conversations.service';

const MAX_TOOL_ROUNDS = 5;
const FALLBACK_MESSAGE =
  "I wasn't able to finish that after several tool calls — could you try rephrasing or breaking it into a simpler request?";

type AgentTool = Awaited<ReturnType<AgentToolsService['listFull']>>[number];

export type ChatStepEvent =
  | { type: 'thinking' }
  | { type: 'tool_call'; toolName: string }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'done'; content: string };

export type ChatStepListener = (event: ChatStepEvent) => void;

function hasParameters(
  tool: AgentTool,
): tool is AgentTool & { parameters: Record<string, unknown> } {
  return tool.parameters != null;
}

function toOpenAiToolDef(
  tool: AgentTool & { parameters: Record<string, unknown> },
): ChatCompletionTool {
  return {
    type: 'function',
    function: {
      // Trusted to match ^[a-zA-Z0-9_-]+$ — enforced by CreateToolDto's
      // @Matches on `name`, since this is what OpenAI requires as a
      // function name and there's no separate display name.
      name: tool.name,
      description: tool.description || tool.name,
      parameters: tool.parameters,
    },
  };
}

@Injectable()
export class ChatService {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly conversationsService: ConversationsService,
    private readonly agentToolsService: AgentToolsService,
    private readonly toolsService: ToolsService,
    private readonly openAiService: OpenAiService,
    private readonly rbacService: RbacService,
  ) {}

  async sendMessage(
    agentId: string,
    organizationId: string,
    userId: string,
    userMessage: string,
    onStep?: ChatStepListener,
  ) {
    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const conversation = await this.conversationsService.findOrCreate(
      agentId,
      userId,
    );

    // Persisted before any OpenAI call so it's never lost if everything
    // downstream fails.
    await this.conversationsService.appendMessage(
      conversation.id,
      'user',
      userMessage,
    );

    // Tool-calling is gated independently of AGENT_READ (which is all
    // chatting itself requires) — a caller without TOOL_EXECUTE gets a
    // tools-free conversation rather than being able to trigger a
    // configured tool's real outbound call through chat.
    const canExecuteTools = await this.rbacService.hasPermission(
      userId,
      organizationId,
      PERMISSIONS.TOOL_EXECUTE,
    );

    let availableTools: (AgentTool & {
      parameters: Record<string, unknown>;
    })[] = [];
    let toolDefs: ChatCompletionTool[] | undefined;

    if (canExecuteTools) {
      const attached = await this.agentToolsService.listFull(
        agentId,
        organizationId,
      );

      // Fail closed: a tool with no parameters schema is skipped, not
      // given a fabricated no-args schema — that would silently tell the
      // model it takes zero arguments when it may not.
      availableTools = attached.filter(hasParameters);
      toolDefs =
        availableTools.length > 0
          ? availableTools.map(toOpenAiToolDef)
          : undefined;
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      onStep?.({ type: 'thinking' });

      const history = await this.conversationsService.loadHistory(
        conversation.id,
      );

      let choice: ChatCompletionMessage;

      try {
        choice = await this.openAiService.createChatCompletion({
          model: agent.model,
          messages: [
            { role: 'system', content: agent.systemPrompt },
            ...toOpenAiMessages(history),
          ],
          tools: toolDefs,
          // Trusted to match AgentConfigurationDto's shape — configuration
          // is only ever written through CreateAgentDto/UpdateAgentDto's
          // nested validation.
          configuration:
            (agent.configuration as AgentConfiguration | null) ?? undefined,
        });
      } catch (error) {
        throw new BadGatewayException(
          error instanceof Error
            ? error.message
            : 'The chat model request failed',
        );
      }

      if (!choice.tool_calls?.length) {
        const finalMessage = await this.conversationsService.appendMessage(
          conversation.id,
          'assistant',
          choice.content ?? '',
        );

        onStep?.({ type: 'done', content: finalMessage.content });

        return {
          conversationId: conversation.id,
          message: finalMessage.content,
        };
      }

      await this.conversationsService.appendMessage(
        conversation.id,
        'assistant',
        choice.content ?? '',
        { toolCalls: choice.tool_calls },
      );

      for (const toolCall of choice.tool_calls) {
        const toolName =
          toolCall.type === 'function' ? toolCall.function.name : 'unknown';

        onStep?.({ type: 'tool_call', toolName });

        const tool = availableTools.find((t) => t.name === toolName);

        let args: Record<string, unknown> = {};

        try {
          const raw =
            toolCall.type === 'function' ? toolCall.function.arguments : '';
          args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        } catch {
          // Malformed args from the model — execute with an empty object
          // and let the result carry the mismatch back to the model.
        }

        const result = tool
          ? await this.toolsService.execute(tool, args)
          : {
              ok: false,
              status: 0,
              body: { error: `Unknown or unavailable tool: ${toolName}` },
            };

        await this.conversationsService.appendMessage(
          conversation.id,
          'tool',
          JSON.stringify(result),
          { toolCallId: toolCall.id, toolName, args, result },
        );

        onStep?.({ type: 'tool_result', toolName, result });
      }
    }

    const finalMessage = await this.conversationsService.appendMessage(
      conversation.id,
      'assistant',
      FALLBACK_MESSAGE,
    );

    onStep?.({ type: 'done', content: finalMessage.content });

    return { conversationId: conversation.id, message: finalMessage.content };
  }

  async getHistory(agentId: string, organizationId: string, userId: string) {
    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const conversation = await this.conversationsService.findForUser(
      agentId,
      userId,
    );

    if (!conversation) {
      return { conversationId: null, messages: [] };
    }

    const messages = await this.conversationsService.loadAll(conversation.id);

    return { conversationId: conversation.id, messages };
  }

  async resetConversation(
    agentId: string,
    organizationId: string,
    userId: string,
  ) {
    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const removed = await this.conversationsService.remove(agentId, userId);

    if (!removed) {
      throw new NotFoundException('No conversation to reset');
    }
  }
}
