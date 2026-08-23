import { Test, TestingModule } from '@nestjs/testing';
import { BadGatewayException, NotFoundException } from '@nestjs/common';

import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';
import { AgentsService } from '../agents/agents.service';
import { AgentToolsService } from '../agent-tools/agent-tools.service';
import { ToolsService } from '../tools/tools.service';
import { OpenAiService } from '../openai/openai.service';
import { RbacService } from '../rbac/rbac.service';

interface CreateChatCompletionCallArg {
  tools?: { function: { name: string } }[];
}

describe('ChatService', () => {
  let service: ChatService;
  let agentsService: { findOne: jest.Mock };
  let conversationsService: {
    create: jest.Mock;
    listForUser: jest.Mock;
    findOwned: jest.Mock;
    appendMessage: jest.Mock;
    loadHistory: jest.Mock;
    loadAll: jest.Mock;
    remove: jest.Mock;
  };
  let agentToolsService: { listFull: jest.Mock };
  let toolsService: { execute: jest.Mock };
  let openAiService: { createChatCompletion: jest.Mock };
  let rbacService: { hasPermission: jest.Mock };

  const organizationId = 'org-1';
  const agentId = 'agent-1';
  const userId = 'user-1';
  const agent = {
    id: agentId,
    organizationId,
    systemPrompt: 'You are helpful.',
    model: 'gpt-4o-mini',
    configuration: null,
  };
  const conversation = { id: 'conv-1', agentId, userId };

  let messageCounter: number;

  beforeEach(async () => {
    messageCounter = 0;

    agentsService = { findOne: jest.fn().mockResolvedValue(agent) };
    conversationsService = {
      create: jest.fn().mockResolvedValue(conversation),
      listForUser: jest.fn().mockResolvedValue([]),
      findOwned: jest.fn().mockResolvedValue(conversation),
      appendMessage: jest
        .fn()
        .mockImplementation((_id: string, role: string, content: string) => {
          messageCounter++;
          return Promise.resolve({
            id: `msg-${messageCounter}`,
            role,
            content,
          });
        }),
      loadHistory: jest.fn().mockResolvedValue([]),
      loadAll: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
    };
    agentToolsService = { listFull: jest.fn().mockResolvedValue([]) };
    toolsService = { execute: jest.fn() };
    openAiService = { createChatCompletion: jest.fn() };
    rbacService = { hasPermission: jest.fn().mockResolvedValue(false) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: AgentsService, useValue: agentsService },
        { provide: ConversationsService, useValue: conversationsService },
        { provide: AgentToolsService, useValue: agentToolsService },
        { provide: ToolsService, useValue: toolsService },
        { provide: OpenAiService, useValue: openAiService },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('createConversation', () => {
    it('throws NotFoundException when the agent is not in the org', async () => {
      agentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createConversation(agentId, organizationId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(conversationsService.create).not.toHaveBeenCalled();
    });

    it('creates a new conversation for the agent and user', async () => {
      const result = await service.createConversation(
        agentId,
        organizationId,
        userId,
      );

      expect(conversationsService.create).toHaveBeenCalledWith(agentId, userId);
      expect(result).toEqual(conversation);
    });
  });

  describe('listConversations', () => {
    it('throws NotFoundException when the agent is not in the org', async () => {
      agentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.listConversations(agentId, organizationId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the threads for this agent and user', async () => {
      const threads = [{ id: 'conv-1', preview: 'hi', lastMessageAt: null }];
      conversationsService.listForUser.mockResolvedValueOnce(threads);

      const result = await service.listConversations(
        agentId,
        organizationId,
        userId,
      );

      expect(conversationsService.listForUser).toHaveBeenCalledWith(
        agentId,
        userId,
      );
      expect(result).toEqual(threads);
    });
  });

  describe('sendMessage', () => {
    it('throws NotFoundException when the agent is not in the org', async () => {
      agentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.sendMessage(
          agentId,
          conversation.id,
          organizationId,
          userId,
          'hi',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(conversationsService.findOwned).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the conversation is not owned by this agent/user', async () => {
      conversationsService.findOwned.mockResolvedValueOnce(null);

      await expect(
        service.sendMessage(
          agentId,
          conversation.id,
          organizationId,
          userId,
          'hi',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(conversationsService.appendMessage).not.toHaveBeenCalled();
    });

    it('persists the user message before calling OpenAI', async () => {
      openAiService.createChatCompletion.mockResolvedValueOnce({
        content: 'hello',
        tool_calls: undefined,
      });

      await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'hi there',
      );

      expect(conversationsService.appendMessage).toHaveBeenNthCalledWith(
        1,
        conversation.id,
        'user',
        'hi there',
      );
      const appendOrder =
        conversationsService.appendMessage.mock.invocationCallOrder[0];
      const openAiOrder =
        openAiService.createChatCompletion.mock.invocationCallOrder[0];
      expect(appendOrder).toBeLessThan(openAiOrder);
    });

    it('returns and persists a plain text response with no tool calls', async () => {
      openAiService.createChatCompletion.mockResolvedValueOnce({
        content: 'hello there',
        tool_calls: undefined,
      });

      const result = await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'hi',
      );

      expect(result).toEqual({
        conversationId: conversation.id,
        message: 'hello there',
      });
      expect(agentToolsService.listFull).not.toHaveBeenCalled();
    });

    it('does not fetch or send tool definitions when the caller lacks TOOL_EXECUTE', async () => {
      rbacService.hasPermission.mockResolvedValueOnce(false);
      openAiService.createChatCompletion.mockResolvedValueOnce({
        content: 'ok',
        tool_calls: undefined,
      });

      await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'hi',
      );

      expect(agentToolsService.listFull).not.toHaveBeenCalled();
      const [call] = openAiService.createChatCompletion.mock.calls[0] as [
        CreateChatCompletionCallArg,
      ];
      expect(call.tools).toBeUndefined();
    });

    it('sends tool definitions for a caller with TOOL_EXECUTE, skipping tools with no parameters schema', async () => {
      rbacService.hasPermission.mockResolvedValueOnce(true);
      agentToolsService.listFull.mockResolvedValueOnce([
        {
          id: 't1',
          name: 'weather',
          type: 'http',
          config: {},
          description: 'Gets weather',
          parameters: { type: 'object', properties: {} },
        },
        {
          id: 't2',
          name: 'no-schema-tool',
          type: 'http',
          config: {},
          description: 'No schema',
          parameters: null,
        },
      ]);
      openAiService.createChatCompletion.mockResolvedValueOnce({
        content: 'ok',
        tool_calls: undefined,
      });

      await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'hi',
      );

      const [call] = openAiService.createChatCompletion.mock.calls[0] as [
        CreateChatCompletionCallArg,
      ];
      expect(call.tools).toHaveLength(1);
      expect(call.tools?.[0].function.name).toBe('weather');
    });

    it('runs a full tool-calling round trip and persists the tool exchange', async () => {
      rbacService.hasPermission.mockResolvedValueOnce(true);
      const tool = {
        id: 't1',
        name: 'weather',
        type: 'http',
        config: { url: 'https://example.com', method: 'GET' },
        description: 'Gets weather',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
        },
      };
      agentToolsService.listFull.mockResolvedValueOnce([tool]);

      openAiService.createChatCompletion
        .mockResolvedValueOnce({
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'weather', arguments: '{"city":"NYC"}' },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: "it's sunny",
          tool_calls: undefined,
        });

      toolsService.execute.mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: { temp: 72 },
      });

      const result = await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'weather?',
      );

      expect(toolsService.execute).toHaveBeenCalledWith(tool, { city: 'NYC' });
      expect(result.message).toBe("it's sunny");

      const calls = conversationsService.appendMessage.mock.calls as [
        string,
        string,
        string,
        Record<string, unknown>?,
      ][];
      const toolMessageCall = calls.find((c) => c[1] === 'tool');
      expect(toolMessageCall).toBeDefined();
      expect(toolMessageCall?.[3]).toMatchObject({
        toolCallId: 'call-1',
        toolName: 'weather',
      });
    });

    it('handles an unavailable/unknown tool call without throwing', async () => {
      rbacService.hasPermission.mockResolvedValueOnce(true);
      agentToolsService.listFull.mockResolvedValueOnce([]);

      openAiService.createChatCompletion
        .mockResolvedValueOnce({
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: { name: 'ghost-tool', arguments: '{}' },
            },
          ],
        })
        .mockResolvedValueOnce({ content: 'done', tool_calls: undefined });

      const result = await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'hi',
      );

      expect(toolsService.execute).not.toHaveBeenCalled();
      expect(result.message).toBe('done');
    });

    it('stops after the max tool-round cap and returns a fallback message', async () => {
      rbacService.hasPermission.mockResolvedValueOnce(true);
      const tool = {
        id: 't1',
        name: 'loopy',
        type: 'http',
        config: { url: 'https://example.com', method: 'GET' },
        description: 'Loops',
        parameters: { type: 'object', properties: {} },
      };
      agentToolsService.listFull.mockResolvedValueOnce([tool]);
      toolsService.execute.mockResolvedValue({
        ok: true,
        status: 200,
        body: {},
      });

      openAiService.createChatCompletion.mockResolvedValue({
        content: null,
        tool_calls: [
          {
            id: 'call-x',
            type: 'function',
            function: { name: 'loopy', arguments: '{}' },
          },
        ],
      });

      const result = await service.sendMessage(
        agentId,
        conversation.id,
        organizationId,
        userId,
        'go forever',
      );

      expect(openAiService.createChatCompletion).toHaveBeenCalledTimes(5);
      expect(result.message).toMatch(/wasn't able to finish/);
    });

    it('wraps an OpenAI failure in BadGatewayException without losing the user message', async () => {
      openAiService.createChatCompletion.mockRejectedValueOnce(
        new Error('rate limited'),
      );

      await expect(
        service.sendMessage(
          agentId,
          conversation.id,
          organizationId,
          userId,
          'hi',
        ),
      ).rejects.toThrow(BadGatewayException);

      expect(conversationsService.appendMessage).toHaveBeenCalledWith(
        conversation.id,
        'user',
        'hi',
      );
    });
  });

  describe('getMessages', () => {
    it('throws NotFoundException when the agent is not in the org', async () => {
      agentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.getMessages(agentId, conversation.id, organizationId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the conversation is not owned by this agent/user', async () => {
      conversationsService.findOwned.mockResolvedValueOnce(null);

      await expect(
        service.getMessages(agentId, conversation.id, organizationId, userId),
      ).rejects.toThrow(NotFoundException);
      expect(conversationsService.loadAll).not.toHaveBeenCalled();
    });

    it('returns the full history for the conversation', async () => {
      conversationsService.loadAll.mockResolvedValueOnce([{ id: 'msg-1' }]);

      const result = await service.getMessages(
        agentId,
        conversation.id,
        organizationId,
        userId,
      );

      expect(result).toEqual({
        conversationId: conversation.id,
        messages: [{ id: 'msg-1' }],
      });
    });
  });

  describe('deleteConversation', () => {
    it('throws NotFoundException when the agent is not in the org', async () => {
      agentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.deleteConversation(
          agentId,
          conversation.id,
          organizationId,
          userId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when there is no matching conversation to delete', async () => {
      conversationsService.remove.mockResolvedValueOnce(null);

      await expect(
        service.deleteConversation(
          agentId,
          conversation.id,
          organizationId,
          userId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('resolves when the conversation is removed', async () => {
      conversationsService.remove.mockResolvedValueOnce({
        id: conversation.id,
      });

      await expect(
        service.deleteConversation(
          agentId,
          conversation.id,
          organizationId,
          userId,
        ),
      ).resolves.toBeUndefined();
      expect(conversationsService.remove).toHaveBeenCalledWith(
        conversation.id,
        agentId,
        userId,
      );
    });
  });
});
