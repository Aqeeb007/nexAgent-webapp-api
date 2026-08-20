import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { RbacService } from '../rbac/rbac.service';

describe('ToolsController', () => {
  let controller: ToolsController;
  let toolsService: {
    create: jest.Mock;
    findAllForOrganization: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    execute: jest.Mock;
  };

  const organizationId = 'org-1';
  const tool = {
    id: 'tool-1',
    organizationId,
    name: 'Weather API',
    type: 'http',
    config: { url: 'https://example.com/weather', method: 'GET' },
  };

  beforeEach(async () => {
    toolsService = {
      create: jest.fn(),
      findAllForOrganization: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      execute: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ToolsController],
      providers: [
        { provide: ToolsService, useValue: toolsService },
        // @UseGuards(PermissionGuard) at the class level makes Nest
        // instantiate PermissionGuard while compiling this module, even
        // though these tests call controller methods directly.
        Reflector,
        { provide: RbacService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ToolsController>(ToolsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to ToolsService.create scoped to the organization', async () => {
      toolsService.create.mockResolvedValue(tool);
      const dto = {
        name: 'Weather API',
        type: 'http' as const,
        config: { url: 'https://example.com/weather', method: 'GET' as const },
        description: 'Gets the current weather for a city',
      };

      const result = await controller.create(organizationId, dto);

      expect(toolsService.create).toHaveBeenCalledWith(organizationId, dto);
      expect(result).toEqual(tool);
    });
  });

  describe('findAll', () => {
    it('delegates to ToolsService.findAllForOrganization', async () => {
      toolsService.findAllForOrganization.mockResolvedValue([tool]);

      const result = await controller.findAll(organizationId);

      expect(toolsService.findAllForOrganization).toHaveBeenCalledWith(
        organizationId,
      );
      expect(result).toEqual([tool]);
    });
  });

  describe('findOne', () => {
    it('returns the tool when found', async () => {
      toolsService.findOne.mockResolvedValue(tool);

      const result = await controller.findOne(organizationId, 'tool-1');

      expect(toolsService.findOne).toHaveBeenCalledWith(
        'tool-1',
        organizationId,
      );
      expect(result).toEqual(tool);
    });

    it('throws NotFoundException when the tool is missing', async () => {
      toolsService.findOne.mockResolvedValue(null);

      await expect(
        controller.findOne(organizationId, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('returns the updated tool when found', async () => {
      const updated = { ...tool, name: 'Renamed' };
      toolsService.update.mockResolvedValue(updated);

      const result = await controller.update(organizationId, 'tool-1', {
        name: 'Renamed',
      });

      expect(toolsService.update).toHaveBeenCalledWith(
        'tool-1',
        organizationId,
        { name: 'Renamed' },
      );
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when the tool is missing', async () => {
      toolsService.update.mockResolvedValue(null);

      await expect(
        controller.update(organizationId, 'missing', { name: 'Renamed' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('resolves with no content when the tool is deleted', async () => {
      toolsService.remove.mockResolvedValue({ id: 'tool-1' });

      const result = await controller.remove(organizationId, 'tool-1');

      expect(toolsService.remove).toHaveBeenCalledWith(
        'tool-1',
        organizationId,
      );
      expect(result).toBeUndefined();
    });

    it('throws NotFoundException when the tool is missing', async () => {
      toolsService.remove.mockResolvedValue(null);

      await expect(
        controller.remove(organizationId, 'missing'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('test', () => {
    it('looks up the tool then delegates to ToolsService.execute', async () => {
      toolsService.findOne.mockResolvedValue(tool);
      toolsService.execute.mockResolvedValue({
        ok: true,
        status: 200,
        body: {},
      });

      const result = await controller.test(organizationId, 'tool-1', {
        args: { city: 'NYC' },
      });

      expect(toolsService.findOne).toHaveBeenCalledWith(
        'tool-1',
        organizationId,
      );
      expect(toolsService.execute).toHaveBeenCalledWith(tool, {
        city: 'NYC',
      });
      expect(result).toEqual({ ok: true, status: 200, body: {} });
    });

    it('defaults args to an empty object when none are provided', async () => {
      toolsService.findOne.mockResolvedValue(tool);
      toolsService.execute.mockResolvedValue({
        ok: true,
        status: 200,
        body: {},
      });

      await controller.test(organizationId, 'tool-1', {});

      expect(toolsService.execute).toHaveBeenCalledWith(tool, {});
    });

    it('throws NotFoundException when the tool is missing', async () => {
      toolsService.findOne.mockResolvedValue(null);

      await expect(
        controller.test(organizationId, 'missing', {}),
      ).rejects.toThrow(NotFoundException);
      expect(toolsService.execute).not.toHaveBeenCalled();
    });
  });
});
