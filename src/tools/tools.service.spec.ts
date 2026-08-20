import { Test, TestingModule } from '@nestjs/testing';
import { ToolsService } from './tools.service';
import { DATABASE } from '../database/database.module';

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolsService, { provide: DATABASE, useValue: mockDb }],
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

  describe('execute', () => {
    const httpTool = {
      type: 'http',
      config: { url: 'https://example.com/weather', method: 'GET' },
    };

    it('throws for an unsupported tool type', async () => {
      await expect(
        service.execute({ type: 'db', config: {} }, {}),
      ).rejects.toThrow('Unsupported tool type: db');
    });

    it('appends args as query params for GET and returns a parsed JSON body', async () => {
      const fetchMock = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ temp: 72 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

      const result = await service.execute(httpTool, { city: 'NYC' });

      const [calledUrl] = fetchMock.mock.calls[0] as [URL];
      expect(calledUrl.toString()).toBe('https://example.com/weather?city=NYC');
      expect(result).toEqual({
        ok: true,
        status: 200,
        body: { temp: 72 },
        truncated: false,
      });
    });

    it('JSON-stringifies object-valued args instead of using [object Object]', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(new Response('{}', { status: 200 }));
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

      await service.execute(httpTool, { filter: { active: true } });

      const [calledUrl] = fetchMock.mock.calls[0] as [URL];
      expect(calledUrl.searchParams.get('filter')).toBe(
        JSON.stringify({ active: true }),
      );
    });

    it('sends args as a JSON body for POST', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(new Response('{"ok":true}', { status: 201 }));
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

      const postTool = {
        type: 'http',
        config: { url: 'https://example.com/orders', method: 'POST' },
      };

      const result = await service.execute(postTool, { item: 'widget' });

      const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ item: 'widget' }));
      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
    });

    it('returns an ok:false shape (never throws) for a non-2xx response', async () => {
      const fetchMock = jest
        .fn()
        .mockResolvedValue(
          new Response('Not Found', { status: 404, statusText: 'Not Found' }),
        );
      jest.spyOn(global, 'fetch').mockImplementation(fetchMock);

      const result = await service.execute(httpTool, {});

      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.body).toBe('Not Found');
    });

    it('returns status 0 (never throws) on a network failure', async () => {
      jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));

      const result = await service.execute(httpTool, {});

      expect(result).toEqual({
        ok: false,
        status: 0,
        body: { error: 'fetch failed' },
      });
    });

    it('truncates a response body larger than the byte cap', async () => {
      const bigChunk = 'a'.repeat(1024);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 300; i++) {
            controller.enqueue(new TextEncoder().encode(bigChunk));
          }
          controller.close();
        },
      });
      const response = new Response(stream, { status: 200 });
      jest.spyOn(global, 'fetch').mockResolvedValue(response);

      const result = await service.execute(httpTool, {});

      expect(result.truncated).toBe(true);
      expect(result.ok).toBe(true);
    });
  });
});
