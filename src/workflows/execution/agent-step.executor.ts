import { Injectable, NotFoundException } from '@nestjs/common';

import { AgentsService } from '../../agents/agents.service';
import {
  OpenAiService,
  type AgentConfiguration,
} from '../../openai/openai.service';
import { UsageService } from '../../usage/usage.service';
import { USAGE_EVENT_TYPES } from '../../usage/constants/usage-event-types';

import { renderInput, renderTemplate } from './template.util';
import type {
  WorkflowStepExecutionContext,
  WorkflowStepExecutor,
} from './workflow-step-executor.interface';

// Single-shot, tool-free: one system-prompt + one user-message call to
// OpenAI, no `tools` sent, no conversation/message rows persisted — a
// workflow run isn't a chat thread. A workflow that needs tool access uses
// a dedicated `tool` step instead of nesting ChatService's loop in here.
@Injectable()
export class AgentStepExecutor implements WorkflowStepExecutor {
  constructor(
    private readonly agentsService: AgentsService,
    private readonly openAiService: OpenAiService,
    private readonly usageService: UsageService,
  ) {}

  async execute(
    config: Record<string, unknown>,
    input: unknown,
    ctx: WorkflowStepExecutionContext,
  ): Promise<{ output: unknown }> {
    const agentId = config.agentId as string;
    const promptTemplate = config.promptTemplate as string | undefined;

    const agent = await this.agentsService.findOne(agentId, ctx.organizationId);

    if (!agent) {
      throw new NotFoundException(`Agent not found: ${agentId}`);
    }

    const userMessage = promptTemplate
      ? renderTemplate(promptTemplate, input)
      : renderInput(input);

    const result = await this.openAiService.createChatCompletion({
      model: agent.model,
      messages: [
        { role: 'system', content: agent.systemPrompt },
        { role: 'user', content: userMessage },
      ],
      configuration:
        (agent.configuration as AgentConfiguration | null) ?? undefined,
    });

    if (result.usage) {
      await this.usageService.record(
        ctx.organizationId,
        USAGE_EVENT_TYPES.CHAT_COMPLETION,
        result.usage.totalTokens,
        {
          agentId,
          model: agent.model,
          source: 'workflow_step',
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
      );
    }

    return { output: { content: result.content } };
  }
}
