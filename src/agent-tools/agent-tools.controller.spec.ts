import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentToolsController } from './agent-tools.controller';
import { AgentToolsService } from './agent-tools.service';
import { RbacService } from '../rbac/rbac.service';

describe('AgentToolsController', () => {
  let controller: AgentToolsController;
  let agentToolsService: {
    attach: jest.Mock;
    list: jest.Mock;
    detach: jest.Mock;
  };

  const organizationId = 'org-1';

  beforeEach(async () => {
    agentToolsService = {
      attach: jest.fn(),
      list: jest.fn(),
      detach: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentToolsController],
      providers: [
        { provide: AgentToolsService, useValue: agentToolsService },
        // @UseGuards(PermissionGuard) at the class level makes Nest
        // instantiate PermissionGuard while compiling this module, even
        // though these tests call controller methods directly.
        Reflector,
        { provide: RbacService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AgentToolsController>(AgentToolsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('attach', () => {
    it('delegates to AgentToolsService.attach', async () => {
      const attachment = { id: 'at-1' };
      agentToolsService.attach.mockResolvedValue(attachment);

      const result = await controller.attach(organizationId, 'agent-1', {
        toolId: 'tool-1',
      });

      expect(agentToolsService.attach).toHaveBeenCalledWith(
        'agent-1',
        'tool-1',
        organizationId,
      );
      expect(result).toEqual(attachment);
    });
  });

  describe('list', () => {
    it('delegates to AgentToolsService.list', async () => {
      const rows = [{ id: 'tool-1', name: 'Weather API' }];
      agentToolsService.list.mockResolvedValue(rows);

      const result = await controller.list(organizationId, 'agent-1');

      expect(agentToolsService.list).toHaveBeenCalledWith(
        'agent-1',
        organizationId,
      );
      expect(result).toEqual(rows);
    });
  });

  describe('detach', () => {
    it('resolves with no content when the attachment is removed', async () => {
      agentToolsService.detach.mockResolvedValue({ id: 'at-1' });

      const result = await controller.detach(
        organizationId,
        'agent-1',
        'tool-1',
      );

      expect(agentToolsService.detach).toHaveBeenCalledWith(
        'agent-1',
        'tool-1',
        organizationId,
      );
      expect(result).toBeUndefined();
    });

    it('throws NotFoundException when the tool is not attached', async () => {
      agentToolsService.detach.mockResolvedValue(null);

      await expect(
        controller.detach(organizationId, 'agent-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
