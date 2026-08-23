import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { RbacService } from '../rbac/rbac.service';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: {
    createConversation: jest.Mock;
    listConversations: jest.Mock;
    sendMessage: jest.Mock;
    getMessages: jest.Mock;
    deleteConversation: jest.Mock;
  };
  let chatGateway: { emitStep: jest.Mock };

  const organizationId = 'org-1';
  const agentId = 'agent-1';
  const conversationId = 'conv-1';
  const user = { id: 'user-1' };

  beforeEach(async () => {
    chatService = {
      createConversation: jest.fn(),
      listConversations: jest.fn(),
      sendMessage: jest.fn(),
      getMessages: jest.fn(),
      deleteConversation: jest.fn(),
    };
    chatGateway = { emitStep: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatService },
        { provide: ChatGateway, useValue: chatGateway },
        // @UseGuards(PermissionGuard) at the class level makes Nest
        // instantiate PermissionGuard while compiling this module, even
        // though these tests call controller methods directly.
        Reflector,
        { provide: RbacService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createConversation', () => {
    it('delegates to ChatService.createConversation with the caller', async () => {
      const response = { id: conversationId };
      chatService.createConversation.mockResolvedValue(response);

      const result = await controller.createConversation(
        organizationId,
        agentId,
        user,
      );

      expect(chatService.createConversation).toHaveBeenCalledWith(
        agentId,
        organizationId,
        user.id,
      );
      expect(result).toEqual(response);
    });
  });

  describe('listConversations', () => {
    it('delegates to ChatService.listConversations', async () => {
      const response = [{ id: conversationId }];
      chatService.listConversations.mockResolvedValue(response);

      const result = await controller.listConversations(
        organizationId,
        agentId,
        user,
      );

      expect(chatService.listConversations).toHaveBeenCalledWith(
        agentId,
        organizationId,
        user.id,
      );
      expect(result).toEqual(response);
    });
  });

  describe('sendMessage', () => {
    it('delegates to ChatService.sendMessage with the caller and message', async () => {
      const response = { conversationId, message: 'hi back' };
      chatService.sendMessage.mockResolvedValue(response);

      const result = await controller.sendMessage(
        organizationId,
        agentId,
        conversationId,
        user,
        { message: 'hello' },
      );

      expect(chatService.sendMessage).toHaveBeenCalledWith(
        agentId,
        conversationId,
        organizationId,
        user.id,
        'hello',
        expect.any(Function),
      );
      expect(result).toEqual(response);
    });

    it('wires the onStep callback to ChatGateway.emitStep for this conversation', async () => {
      chatService.sendMessage.mockResolvedValue({
        conversationId,
        message: 'hi',
      });

      await controller.sendMessage(
        organizationId,
        agentId,
        conversationId,
        user,
        { message: 'hello' },
      );

      const [, , , , , onStep] = chatService.sendMessage.mock.calls[0] as [
        string,
        string,
        string,
        string,
        string,
        (event: unknown) => void,
      ];
      const event = { type: 'thinking' };
      onStep(event);

      expect(chatGateway.emitStep).toHaveBeenCalledWith(conversationId, event);
    });
  });

  describe('getMessages', () => {
    it('delegates to ChatService.getMessages', async () => {
      const response = { conversationId, messages: [] };
      chatService.getMessages.mockResolvedValue(response);

      const result = await controller.getMessages(
        organizationId,
        agentId,
        conversationId,
        user,
      );

      expect(chatService.getMessages).toHaveBeenCalledWith(
        agentId,
        conversationId,
        organizationId,
        user.id,
      );
      expect(result).toEqual(response);
    });
  });

  describe('deleteConversation', () => {
    it('delegates to ChatService.deleteConversation', async () => {
      chatService.deleteConversation.mockResolvedValue(undefined);

      const result = await controller.deleteConversation(
        organizationId,
        agentId,
        conversationId,
        user,
      );

      expect(chatService.deleteConversation).toHaveBeenCalledWith(
        agentId,
        conversationId,
        organizationId,
        user.id,
      );
      expect(result).toBeUndefined();
    });
  });
});
