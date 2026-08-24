import { Test, TestingModule } from '@nestjs/testing';
import { ToolsService } from './tools.service';
import { DATABASE } from '../database/database.module';
import { ToolExecutorRegistry } from './executors/tool-executor.registry';

describe('ToolsService', () => {
  let service: ToolsService;
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
  let mockExecutor: { execute: jest.Mock };
  let mockRegistry: { get: jest.Mock };

  const organizationId = 'org-1';
  const toolRow = {
    id: 'tool-1',
    organizationId,
    name: 'Weather API',
    type: 'http',
    config: { url: 'https://example.com/weather', method: 'GET' },
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

    mockExecutor = {
      execute: jest.fn().mockResolvedValue({ ok: true, status: 200, body: {} }),
    };
    mockRegistry = { get: jest.fn().mockReturnValue(mockExecutor) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsService,
        { provide: DATABASE, useValue: mockDb },
        { provide: ToolExecutorRegistry, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<ToolsService>(ToolsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('inserts and returns the new tool', async () => {
      mockDb.returning.mockResolvedValueOnce([toolRow]);

      const result = await service.create(organizationId, {
        name: 'Weather API',
        type: 'http',
        config: { url: 'https://example.com/weather', method: 'GET' },
        description: 'Gets the current weather for a city',
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, name: 'Weather API' }),
      );
      expect(result).toEqual(toolRow);
    });
  });

  describe('findAllForOrganization', () => {
    it('returns every tool scoped to the organization', async () => {
      mockDb.where.mockResolvedValueOnce([toolRow]);

      const result = await service.findAllForOrganization(organizationId);

      expect(mockDb.select).toHaveBeenCalled();
      expect(result).toEqual([toolRow]);
    });
  });

  describe('findOne', () => {
    it('returns the tool when it exists in the given organization', async () => {
      mockDb.limit.mockResolvedValueOnce([toolRow]);

      const result = await service.findOne('tool-1', organizationId);

      expect(result).toEqual(toolRow);
    });

    it('returns null when the tool belongs to a different organization', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findOne('tool-1', 'some-other-org');

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('updates and returns the tool when found in the given organization', async () => {
      const updated = { ...toolRow, name: 'Renamed Tool' };
      mockDb.returning.mockResolvedValueOnce([updated]);

      const result = await service.update('tool-1', organizationId, {
        name: 'Renamed Tool',
      });

      const [setArg] = mockDb.set.mock.calls[0] as [
        { name: string; updatedAt: Date },
      ];
      expect(setArg.name).toBe('Renamed Tool');
      expect(setArg.updatedAt).toBeInstanceOf(Date);
      expect(result).toEqual(updated);
    });

    it('returns null when the tool is not found or belongs to a different organization', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.update('tool-1', 'some-other-org', {
        name: 'Renamed Tool',
      });

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes and returns the id when found in the given organization', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'tool-1' }]);

      const result = await service.remove('tool-1', organizationId);

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ id: 'tool-1' });
    });

    it('returns null when the tool is not found or belongs to a different organization', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.remove('tool-1', 'some-other-org');

      expect(result).toBeNull();
    });
  });

  // Per-type behavior lives in each executor's own spec (see
  // src/tools/executors/*.spec.ts) — ToolsService.execute is just a
  // one-line delegate to ToolExecutorRegistry, so these tests only cover
  // that delegation.
  describe('execute', () => {
    const httpTool = {
      type: 'http',
      config: { url: 'https://example.com/weather', method: 'GET' },
    };

    it('delegates to the executor resolved from the registry for the tool type', async () => {
      const result = await service.execute(httpTool, { city: 'NYC' });

      expect(mockRegistry.get).toHaveBeenCalledWith('http');
      expect(mockExecutor.execute).toHaveBeenCalledWith(httpTool.config, {
        city: 'NYC',
      });
      expect(result).toEqual({ ok: true, status: 200, body: {} });
    });

    it('defaults a null config to an empty object before delegating', async () => {
      await service.execute({ type: 'http', config: null }, {});

      expect(mockExecutor.execute).toHaveBeenCalledWith({}, {});
    });

    it('propagates the registry throwing for an unsupported tool type', async () => {
      mockRegistry.get.mockImplementation(() => {
        throw new Error('Unsupported tool type: db');
      });

      await expect(
        service.execute({ type: 'db', config: {} }, {}),
      ).rejects.toThrow('Unsupported tool type: db');
    });
  });
});
