import { Test, TestingModule } from '@nestjs/testing';
import { AgentsService } from './agents.service';
import { DATABASE } from '../database/database.module';

describe('AgentsService', () => {
  let service: AgentsService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    returning: jest.Mock;
  };

  const organizationId = 'org-1';
  const agentRow = {
    id: 'agent-1',
    organizationId,
    name: 'Support Agent',
    description: null,
    systemPrompt: 'You are a helpful assistant.',
    model: 'gpt-4o-mini',
    configuration: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsService, { provide: DATABASE, useValue: mockDb }],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('inserts and returns the new agent', async () => {
      mockDb.returning.mockResolvedValueOnce([agentRow]);

      const result = await service.create(organizationId, {
        name: 'Support Agent',
        systemPrompt: 'You are a helpful assistant.',
        model: 'gpt-4o-mini',
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, name: 'Support Agent' }),
      );
      expect(result).toEqual(agentRow);
    });
  });

  describe('findAllForOrganization', () => {
    it('returns every agent scoped to the organization', async () => {
      mockDb.where.mockResolvedValueOnce([agentRow]);

      const result = await service.findAllForOrganization(organizationId);

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual([agentRow]);
    });
  });

  describe('findOne', () => {
    it('returns the agent when it exists in the given organization', async () => {
      mockDb.limit.mockResolvedValueOnce([agentRow]);

      const result = await service.findOne('agent-1', organizationId);

      expect(result).toEqual(agentRow);
    });

    it('returns null when the agent does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findOne('missing', organizationId);

      expect(result).toBeNull();
    });

    it('returns null when the agent belongs to a different organization', async () => {
      // The compound WHERE (id AND organizationId) means a cross-org id
      // resolves to the same empty result as a nonexistent one — the
      // service can't and shouldn't distinguish the two.
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findOne('agent-1', 'some-other-org');

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('updates and returns the agent when found in the given organization', async () => {
      const updated = { ...agentRow, name: 'Renamed Agent' };
      mockDb.returning.mockResolvedValueOnce([updated]);

      const result = await service.update('agent-1', organizationId, {
        name: 'Renamed Agent',
      });

      const [setArg] = mockDb.set.mock.calls[0] as [
        { name: string; updatedAt: Date },
      ];
      expect(setArg.name).toBe('Renamed Agent');
      expect(setArg.updatedAt).toBeInstanceOf(Date);
      expect(result).toEqual(updated);
    });

    it('returns null when the agent is not found or belongs to a different organization', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.update('agent-1', 'some-other-org', {
        name: 'Renamed Agent',
      });

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes and returns the id when found in the given organization', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'agent-1' }]);

      const result = await service.remove('agent-1', organizationId);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ id: 'agent-1' });
    });

    it('returns null when the agent is not found or belongs to a different organization', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.remove('agent-1', 'some-other-org');

      expect(result).toBeNull();
    });
  });
});
