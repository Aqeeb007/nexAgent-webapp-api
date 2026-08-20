import { Test, TestingModule } from '@nestjs/testing';
import {
  ConversationsService,
  toOpenAiMessages,
} from './conversations.service';
import { DATABASE } from '../database/database.module';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let mockDb: {
    insert: jest.Mock;
    values: jest.Mock;
    onConflictDoNothing: jest.Mock;
    returning: jest.Mock;
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    orderBy: jest.Mock;
    delete: jest.Mock;
  };

  const agentId = 'agent-1';
  const userId = 'user-1';
  const conversation = { id: 'conv-1', agentId, userId, createdAt: new Date() };

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      onConflictDoNothing: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      orderBy: jest.fn(),
      delete: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationsService,
        { provide: DATABASE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<ConversationsService>(ConversationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOrCreate', () => {
    it('returns the newly inserted conversation on the happy path', async () => {
      mockDb.returning.mockResolvedValueOnce([conversation]);

      const result = await service.findOrCreate(agentId, userId);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.onConflictDoNothing).toHaveBeenCalled();
      expect(result).toEqual(conversation);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it('falls back to selecting the existing row on a conflict (double-submit race)', async () => {
      mockDb.returning.mockResolvedValueOnce([]);
      mockDb.limit.mockResolvedValueOnce([conversation]);

      const result = await service.findOrCreate(agentId, userId);

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual(conversation);
    });
  });

  describe('findForUser', () => {
    it('returns the conversation when one exists', async () => {
      mockDb.limit.mockResolvedValueOnce([conversation]);

      const result = await service.findForUser(agentId, userId);

      expect(result).toEqual(conversation);
    });

    it('returns null when none exists', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findForUser(agentId, userId);

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes and returns the id when found', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: conversation.id }]);

      const result = await service.remove(agentId, userId);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ id: conversation.id });
    });

    it('returns null when nothing to delete', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.remove(agentId, userId);

      expect(result).toBeNull();
    });
  });

  describe('appendMessage', () => {
    it('inserts a message and returns it', async () => {
      const message = {
        id: 'msg-1',
        conversationId: conversation.id,
        role: 'user',
        content: 'hi',
        toolCallData: null,
      };
      mockDb.returning.mockResolvedValueOnce([message]);

      const result = await service.appendMessage(conversation.id, 'user', 'hi');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(message);
    });
  });

  describe('loadHistory', () => {
    function row(overrides: Record<string, unknown>) {
      return {
        id: `msg-${Math.random()}`,
        conversationId: conversation.id,
        role: 'user',
        content: '',
        toolCallData: null,
        sequence: 0,
        createdAt: new Date(),
        ...overrides,
      };
    }

    it('returns everything when under the turn cap', async () => {
      const rows = [
        row({ role: 'user', content: 'hi' }),
        row({ role: 'assistant', content: 'hello' }),
      ];
      mockDb.orderBy.mockResolvedValueOnce(rows);

      const result = await service.loadHistory(conversation.id, 20);

      expect(result).toEqual(rows);
    });

    it('trims to the most recent N turns without cutting mid-round', async () => {
      const rows = [
        row({ role: 'user', content: 'turn 1' }),
        row({ role: 'assistant', content: 'reply 1' }),
        row({ role: 'user', content: 'turn 2' }),
        row({ role: 'assistant', content: 'reply 2' }),
        row({ role: 'user', content: 'turn 3' }),
        row({ role: 'assistant', content: 'reply 3' }),
      ];
      mockDb.orderBy.mockResolvedValueOnce(rows);

      const result = await service.loadHistory(conversation.id, 2);

      expect(result).toEqual(rows.slice(2));
      expect(result[0].content).toBe('turn 2');
    });
  });

  describe('loadAll', () => {
    it('returns every row for the conversation, unwindowed', async () => {
      const rows = [{ id: 'msg-1' }];
      mockDb.orderBy.mockResolvedValueOnce(rows);

      const result = await service.loadAll(conversation.id);

      expect(result).toEqual(rows);
    });
  });
});

describe('toOpenAiMessages', () => {
  function row(overrides: Record<string, unknown>) {
    return {
      id: `msg-${Math.random()}`,
      conversationId: 'conv-1',
      role: 'user',
      content: '',
      toolCallData: null,
      sequence: 0,
      createdAt: new Date(),
      ...overrides,
    };
  }

  it('maps a plain user/assistant exchange straight through', () => {
    const rows = [
      row({ role: 'user', content: 'hi' }),
      row({ role: 'assistant', content: 'hello' }),
    ];

    expect(toOpenAiMessages(rows)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
  });

  it('reconstructs a complete tool-calling round faithfully', () => {
    const toolCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'weather', arguments: '{}' },
      },
    ];
    const rows = [
      row({ role: 'user', content: 'what is the weather' }),
      row({ role: 'assistant', content: '', toolCallData: { toolCalls } }),
      row({
        role: 'tool',
        content: '{"ok":true}',
        toolCallData: {
          toolCallId: 'call-1',
          toolName: 'weather',
          args: {},
          result: {},
        },
      }),
      row({ role: 'assistant', content: "it's sunny" }),
    ];

    expect(toOpenAiMessages(rows)).toEqual([
      { role: 'user', content: 'what is the weather' },
      { role: 'assistant', content: null, tool_calls: toolCalls },
      { role: 'tool', tool_call_id: 'call-1', content: '{"ok":true}' },
      { role: 'assistant', content: "it's sunny" },
    ]);
  });

  it('drops a trailing incomplete round (process crashed mid-loop)', () => {
    const toolCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'weather', arguments: '{}' },
      },
    ];
    const rows = [
      row({ role: 'user', content: 'what is the weather' }),
      row({ role: 'assistant', content: '', toolCallData: { toolCalls } }),
      // no matching tool row — process died before it landed
    ];

    expect(toOpenAiMessages(rows)).toEqual([
      { role: 'user', content: 'what is the weather' },
    ]);
  });

  it('drops an incomplete round even when followed by a new user turn', () => {
    const toolCalls = [
      {
        id: 'call-1',
        type: 'function',
        function: { name: 'weather', arguments: '{}' },
      },
    ];
    const rows = [
      row({ role: 'user', content: 'turn 1' }),
      row({ role: 'assistant', content: '', toolCallData: { toolCalls } }),
      row({ role: 'user', content: 'turn 2' }),
      row({ role: 'assistant', content: 'reply' }),
    ];

    expect(toOpenAiMessages(rows)).toEqual([
      { role: 'user', content: 'turn 1' },
      { role: 'user', content: 'turn 2' },
      { role: 'assistant', content: 'reply' },
    ]);
  });
});
