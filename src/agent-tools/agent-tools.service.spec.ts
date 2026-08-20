import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AgentToolsService } from './agent-tools.service';
import { AgentsService } from '../agents/agents.service';
import { ToolsService } from '../tools/tools.service';
import { DATABASE } from '../database/database.module';

describe('AgentToolsService', () => {
  let service: AgentToolsService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    delete: jest.Mock;
    returning: jest.Mock;
  };
  let mockAgentsService: { findOne: jest.Mock };
  let mockToolsService: { findOne: jest.Mock };

  const organizationId = 'org-1';
  const agent = { id: 'agent-1', organizationId };
  const tool = { id: 'tool-1', organizationId };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    mockAgentsService = { findOne: jest.fn() };
    mockToolsService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentToolsService,
        { provide: DATABASE, useValue: mockDb },
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: ToolsService, useValue: mockToolsService },
      ],
    }).compile();

    service = module.get<AgentToolsService>(AgentToolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('attach', () => {
    it('inserts and returns the attachment when both agent and tool are in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      mockToolsService.findOne.mockResolvedValueOnce(tool);
      const attachment = { id: 'at-1', agentId: 'agent-1', toolId: 'tool-1' };
      mockDb.returning.mockResolvedValueOnce([attachment]);

      const result = await service.attach('agent-1', 'tool-1', organizationId);

      expect(mockAgentsService.findOne).toHaveBeenCalledWith(
        'agent-1',
        organizationId,
      );
      expect(mockToolsService.findOne).toHaveBeenCalledWith(
        'tool-1',
        organizationId,
      );
      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(attachment);
    });

    it('throws NotFoundException when the agent is not in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.attach('agent-1', 'tool-1', organizationId),
      ).rejects.toThrow(NotFoundException);
      expect(mockToolsService.findOne).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the tool is not in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      mockToolsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.attach('agent-1', 'tool-1', organizationId),
      ).rejects.toThrow(NotFoundException);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the tool is already attached', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      mockToolsService.findOne.mockResolvedValueOnce(tool);
      mockDb.returning.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.attach('agent-1', 'tool-1', organizationId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('list', () => {
    it('returns curated attached-tool rows when the agent is in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      const rows = [
        {
          id: 'tool-1',
          name: 'Weather API',
          type: 'http',
          attachedAt: new Date(),
        },
      ];
      mockDb.where.mockResolvedValueOnce(rows);

      const result = await service.list('agent-1', organizationId);

      expect(mockDb.innerJoin).toHaveBeenCalled();
      expect(result).toEqual(rows);
    });

    it('throws NotFoundException when the agent is not in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(null);

      await expect(service.list('agent-1', organizationId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('listFull', () => {
    it('returns full tool rows when the agent is in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      const rows = [
        {
          id: 'tool-1',
          name: 'Weather API',
          type: 'http',
          config: { url: 'https://example.com', method: 'GET' },
          description: 'Gets weather',
          parameters: { type: 'object', properties: {} },
        },
      ];
      mockDb.where.mockResolvedValueOnce(rows);

      const result = await service.listFull('agent-1', organizationId);

      expect(mockDb.innerJoin).toHaveBeenCalled();
      expect(result).toEqual(rows);
    });

    it('throws NotFoundException when the agent is not in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(null);

      await expect(service.listFull('agent-1', organizationId)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDb.select).not.toHaveBeenCalled();
    });
  });

  describe('detach', () => {
    it('deletes and returns the id when the attachment exists', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'at-1' }]);

      const result = await service.detach('agent-1', 'tool-1', organizationId);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ id: 'at-1' });
    });

    it('returns null when the attachment does not exist', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.detach('agent-1', 'tool-1', organizationId);

      expect(result).toBeNull();
    });
  });
});
