import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { RbacService } from '../rbac/rbac.service';

describe('AgentsController', () => {
  let controller: AgentsController;
  let agentsService: {
    create: jest.Mock;
    findAllForOrganization: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  const organizationId = 'org-1';
  const agent = {
    id: 'agent-1',
    organizationId,
    name: 'Support Agent',
    systemPrompt: 'You are a helpful assistant.',
    model: 'gpt-4o-mini',
  };

  beforeEach(async () => {
    agentsService = {
      create: jest.fn(),
      findAllForOrganization: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentsController],
      providers: [
        { provide: AgentsService, useValue: agentsService },
        // The controller carries @UseGuards(PermissionGuard) as class
        // metadata, so Nest instantiates PermissionGuard as part of
        // compiling this module even though these tests call controller
        // methods directly and never actually run the guard.
        Reflector,
        { provide: RbacService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AgentsController>(AgentsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to AgentsService.create scoped to the organization', async () => {
      agentsService.create.mockResolvedValue(agent);
      const dto = {
        name: 'Support Agent',
        systemPrompt: 'You are a helpful assistant.',
        model: 'gpt-4o-mini',
      };

      const result = await controller.create(organizationId, dto);

      expect(agentsService.create).toHaveBeenCalledWith(organizationId, dto);
      expect(result).toEqual(agent);
    });
  });

  describe('findAll', () => {
    it('delegates to AgentsService.findAllForOrganization', async () => {
      agentsService.findAllForOrganization.mockResolvedValue([agent]);

      const result = await controller.findAll(organizationId);

      expect(agentsService.findAllForOrganization).toHaveBeenCalledWith(
        organizationId,
      );
      expect(result).toEqual([agent]);
    });
  });

  describe('findOne', () => {
    it('returns the agent when found', async () => {
      agentsService.findOne.mockResolvedValue(agent);

      const result = await controller.findOne(organizationId, 'agent-1');

      expect(agentsService.findOne).toHaveBeenCalledWith(
        'agent-1',
        organizationId,
      );
      expect(result).toEqual(agent);
    });

    it('throws NotFoundException when the agent is missing', async () => {
      agentsService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(organizationId, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('returns the updated agent when found', async () => {
      const updated = { ...agent, name: 'Renamed' };
      agentsService.update.mockResolvedValue(updated);

      const result = await controller.update(organizationId, 'agent-1', {
        name: 'Renamed',
      });

      expect(agentsService.update).toHaveBeenCalledWith(
        'agent-1',
        organizationId,
        { name: 'Renamed' },
      );
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the agent is missing', async () => {
      agentsService.update.mockResolvedValue(null);

      await expect(
        controller.update(organizationId, 'missing', { name: 'Renamed' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('resolves with no content when the agent is deleted', async () => {
      agentsService.remove.mockResolvedValue({ id: 'agent-1' });

      const result = await controller.remove(organizationId, 'agent-1');

      expect(agentsService.remove).toHaveBeenCalledWith(
        'agent-1',
        organizationId,
      );
      expect(result).toBeUndefined();
    });

    it('throws NotFoundException when the agent is missing', async () => {
      agentsService.remove.mockResolvedValue(null);

      await expect(
        controller.remove(organizationId, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
