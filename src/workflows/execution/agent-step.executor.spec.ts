import { NotFoundException } from '@nestjs/common';
import { AgentStepExecutor } from './agent-step.executor';
import type { AgentsService } from '../../agents/agents.service';
import type { OpenAiService } from '../../openai/openai.service';
import type { UsageService } from '../../usage/usage.service';

describe('AgentStepExecutor', () => {
  let executor: AgentStepExecutor;
  let mockAgentsService: { findOne: jest.Mock };
  let mockOpenAiService: { createChatCompletion: jest.Mock };
  let mockUsageService: { record: jest.Mock };

  const organizationId = 'org-1';
  const userId = 'user-1';
  const agent = {
    id: 'agent-1',
    organizationId,
    model: 'gpt-4o-mini',
    systemPrompt: 'You are helpful.',
    configuration: { temperature: 0.5 },
  };

  beforeEach(() => {
    mockAgentsService = { findOne: jest.fn().mockResolvedValue(agent) };
    mockOpenAiService = {
      createChatCompletion: jest.fn().mockResolvedValue({
        content: 'the answer',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
    };
    mockUsageService = { record: jest.fn().mockResolvedValue(undefined) };

    executor = new AgentStepExecutor(
      mockAgentsService as unknown as AgentsService,
      mockOpenAiService as unknown as OpenAiService,
      mockUsageService as unknown as UsageService,
    );
  });

  it('throws when the agent is not found in the caller organization', async () => {
    mockAgentsService.findOne.mockResolvedValueOnce(null);

    await expect(
      executor.execute({ agentId: 'missing' }, 'hi', {
        organizationId,
        userId,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('sends the raw stringified input as the user message when no promptTemplate is set', async () => {
    await executor.execute(
      { agentId: 'agent-1' },
      { city: 'NYC' },
      {
        organizationId,
        userId,
      },
    );

    expect(mockOpenAiService.createChatCompletion).toHaveBeenCalledWith({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: '{"city":"NYC"}' },
      ],
      configuration: { temperature: 0.5 },
    });
  });

  it('renders {{input}} inside promptTemplate when set', async () => {
    await executor.execute(
      { agentId: 'agent-1', promptTemplate: 'Summarize: {{input}}' },
      'raw text',
      { organizationId, userId },
    );

    expect(mockOpenAiService.createChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Summarize: raw text' },
        ],
      }),
    );
  });

  it('returns the completion content as output', async () => {
    const { output } = await executor.execute({ agentId: 'agent-1' }, 'hi', {
      organizationId,
      userId,
    });

    expect(output).toEqual({ content: 'the answer' });
  });

  it('records chat_completion usage when the response includes usage', async () => {
    await executor.execute({ agentId: 'agent-1' }, 'hi', {
      organizationId,
      userId,
    });

    expect(mockUsageService.record).toHaveBeenCalledWith(
      organizationId,
      'chat_completion',
      15,
      expect.objectContaining({ agentId: 'agent-1', source: 'workflow_step' }),
    );
  });

  it('does not record usage when the response has none', async () => {
    mockOpenAiService.createChatCompletion.mockResolvedValueOnce({
      content: 'no usage chunk',
    });

    await executor.execute({ agentId: 'agent-1' }, 'hi', {
      organizationId,
      userId,
    });

    expect(mockUsageService.record).not.toHaveBeenCalled();
  });
});
