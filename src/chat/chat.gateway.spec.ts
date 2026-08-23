import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';
import { RbacService } from '../rbac/rbac.service';
import { PERMISSIONS } from '../rbac/constants/permissions';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let conversationsService: { findOwned: jest.Mock };
  let chatService: { sendMessage: jest.Mock };
  let rbacService: { hasPermission: jest.Mock };

  const agentId = 'agent-1';
  const conversationId = 'conv-1';
  const userId = 'user-1';
  const organizationId = 'org-1';

  const makeClient = (token?: string, orgId?: string) => ({
    handshake: {
      auth: {
        ...(token !== undefined ? { token } : {}),
        ...(orgId !== undefined ? { organizationId: orgId } : {}),
      },
    },
    data: {} as Record<string, unknown>,
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('secret') };
    conversationsService = { findOwned: jest.fn() };
    chatService = { sendMessage: jest.fn() };
    rbacService = { hasPermission: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: ConversationsService, useValue: conversationsService },
        { provide: ChatService, useValue: chatService },
        { provide: RbacService, useValue: rbacService },
      ],
    }).compile();

    gateway = module.get<ChatGateway>(ChatGateway);
  });

  describe('handleConnection', () => {
    it('disconnects a client with no token', async () => {
      const client = makeClient(undefined, organizationId);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('disconnects a client with no organizationId', async () => {
      const client = makeClient('good.token', undefined);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
    });

    it('disconnects a client with an invalid token', async () => {
      jwtService.verifyAsync.mockRejectedValueOnce(new Error('bad token'));
      const client = makeClient('bad.token', organizationId);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('stores the userId and organizationId on the client for a valid token', async () => {
      jwtService.verifyAsync.mockResolvedValueOnce({ sub: userId });
      const client = makeClient('good.token', organizationId);

      await gateway.handleConnection(client as never);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.userId).toBe(userId);
      expect(client.data.organizationId).toBe(organizationId);
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

  describe('handleSendMessage', () => {
    const dto = { agentId, conversationId, message: 'hi' };

    it('emits sendMessageError when the client is missing auth data', async () => {
      const client = makeClient();

      await gateway.handleSendMessage(dto, client as never);

      expect(rbacService.hasPermission).not.toHaveBeenCalled();
      expect(chatService.sendMessage).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('sendMessageError', {
        message: 'Not authenticated',
      });
    });

    it('emits sendMessageError when the caller lacks permission', async () => {
      rbacService.hasPermission.mockResolvedValueOnce(false);
      const client = makeClient();
      client.data.userId = userId;
      client.data.organizationId = organizationId;

      await gateway.handleSendMessage(dto, client as never);

      expect(rbacService.hasPermission).toHaveBeenCalledWith(
        userId,
        organizationId,
        PERMISSIONS.AGENT_READ,
      );
      expect(chatService.sendMessage).not.toHaveBeenCalled();
      expect(client.emit).toHaveBeenCalledWith('sendMessageError', {
        message: 'Insufficient permissions',
      });
    });

    it('delegates to ChatService.sendMessage and emits messageSent on success', async () => {
      const result = { conversationId, message: 'hi back' };
      chatService.sendMessage.mockResolvedValueOnce(result);
      const client = makeClient();
      client.data.userId = userId;
      client.data.organizationId = organizationId;

      await gateway.handleSendMessage(dto, client as never);

      expect(chatService.sendMessage).toHaveBeenCalledWith(
        agentId,
        conversationId,
        organizationId,
        userId,
        'hi',
        expect.any(Function),
      );
      expect(client.emit).toHaveBeenCalledWith('messageSent', result);
    });

    it('wires the onStep callback to emitStep for the conversation room', async () => {
      chatService.sendMessage.mockImplementationOnce(
        (
          _agentId: string,
          _conversationId: string,
          _organizationId: string,
          _userId: string,
          _message: string,
          onStep?: (event: { type: string }) => void,
        ) => {
          onStep?.({ type: 'thinking' });
          return Promise.resolve({ conversationId, message: 'hi back' });
        },
      );
      const roomEmit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit: roomEmit });
      gateway.server = { to } as never;
      const client = makeClient();
      client.data.userId = userId;
      client.data.organizationId = organizationId;

      await gateway.handleSendMessage(dto, client as never);

      expect(to).toHaveBeenCalledWith(`conversation:${conversationId}`);
      expect(roomEmit).toHaveBeenCalledWith('thinking', { type: 'thinking' });
    });

    it('emits sendMessageError when ChatService.sendMessage throws', async () => {
      chatService.sendMessage.mockRejectedValueOnce(
        new Error('Agent not found'),
      );
      const client = makeClient();
      client.data.userId = userId;
      client.data.organizationId = organizationId;

      await gateway.handleSendMessage(dto, client as never);

      expect(client.emit).toHaveBeenCalledWith('sendMessageError', {
        message: 'Agent not found',
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
