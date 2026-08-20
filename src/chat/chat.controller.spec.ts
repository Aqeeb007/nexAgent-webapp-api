import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RbacService } from '../rbac/rbac.service';

describe('ChatController', () => {
  let controller: ChatController;
  let chatService: {
    sendMessage: jest.Mock;
    getHistory: jest.Mock;
    resetConversation: jest.Mock;
  };

  const organizationId = 'org-1';
  const agentId = 'agent-1';
  const user = { id: 'user-1' };

  beforeEach(async () => {
    chatService = {
      sendMessage: jest.fn(),
      getHistory: jest.fn(),
      resetConversation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        { provide: ChatService, useValue: chatService },
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

  describe('sendMessage', () => {
    it('delegates to ChatService.sendMessage with the caller and message', async () => {
      const response = { conversationId: 'conv-1', message: 'hi back' };
      chatService.sendMessage.mockResolvedValue(response);

      const result = await controller.sendMessage(
        organizationId,
        agentId,
        user,
        {
          message: 'hello',
        },
      );

      expect(chatService.sendMessage).toHaveBeenCalledWith(
        agentId,
        organizationId,
        user.id,
        'hello',
      );
      expect(result).toEqual(response);
    });
  });

  describe('getHistory', () => {
    it('delegates to ChatService.getHistory', async () => {
      const response = { conversationId: 'conv-1', messages: [] };
      chatService.getHistory.mockResolvedValue(response);

      const result = await controller.getHistory(organizationId, agentId, user);

      expect(chatService.getHistory).toHaveBeenCalledWith(
        agentId,
        organizationId,
        user.id,
      );
      expect(result).toEqual(response);
    });
  });

  describe('resetConversation', () => {
    it('delegates to ChatService.resetConversation', async () => {
      chatService.resetConversation.mockResolvedValue(undefined);

      const result = await controller.resetConversation(
        organizationId,
        agentId,
        user,
      );

      expect(chatService.resetConversation).toHaveBeenCalledWith(
        agentId,
        organizationId,
        user.id,
      );
      expect(result).toBeUndefined();
    });
  });
});
