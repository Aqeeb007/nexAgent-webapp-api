import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { ChatGateway } from './chat.gateway';
import { ConversationsService } from './conversations.service';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let conversationsService: { findOwned: jest.Mock };

  const agentId = 'agent-1';
  const conversationId = 'conv-1';
  const userId = 'user-1';

  const makeClient = (token?: string) => ({
    handshake: { auth: token !== undefined ? { token } : {} },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('secret') };
    conversationsService = { findOwned: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: ConversationsService, useValue: conversationsService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  describe('handleConnection', () => {
    it('disconnects a client with no token', async () => {
      const client = makeClient(undefined);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('disconnects a client with an invalid token', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(new Error('bad token'));
      const client = makeClient('bad.token');

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('stores the userId on the client for a valid token', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({ sub: userId });
      const client = makeClient('good.token');

      await gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.userId).toBe(userId);
    });
  });

  describe('handleJoin', () => {
    it('joins the conversation room when the caller owns it', async () => {
      conversationsService.findOwned.mockResolvedValueOnce({
        id: conversationId,
      });
      const client = makeClient();
      client.data.userId = userId;

      await gateway.handleJoin({ agentId, conversationId }, client as never);

      expect(conversationsService.findOwned).toHaveBeenCalledWith(
        conversationId,
        agentId,
        userId,
      );
      expect(client.join).toHaveBeenCalledWith(
        `conversation:${conversationId}`,
      );
      expect(client.emit).toHaveBeenCalledWith('joined', { conversationId });
    });

    it('emits an error and does not join when the conversation is not owned', async () => {
      conversationsService.findOwned.mockResolvedValueOnce(null);
      const client = makeClient();
      client.data.userId = userId;

      await gateway.handleJoin({ agentId, conversationId }, client as never);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('error', {
        message: 'Conversation not found',
      });
    });
  });

  describe('emitStep', () => {
    it('emits the event to the conversation room, keyed by event type', () => {
      const roomEmit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit: roomEmit });
      gateway.server = { to } as never;

      const event = { type: 'thinking' as const };
      gateway.emitStep(conversationId, event);

      expect(to).toHaveBeenCalledWith(`conversation:${conversationId}`);
      expect(roomEmit).toHaveBeenCalledWith('thinking', event);
    });
  });
});
