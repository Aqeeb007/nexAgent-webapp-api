import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { UsageService } from './usage.service';
import { DATABASE } from '../database/database.module';
import { USAGE_EVENT_TYPES } from './constants/usage-event-types';

describe('UsageService', () => {
  let service: UsageService;
  let mockDb: {
    insert: jest.Mock;
    values: jest.Mock;
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    groupBy: jest.Mock;
    orderBy: jest.Mock;
  };

  const organizationId = 'org-1';

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // `summary`/`summaryByAgent` end the chain at groupBy(); dailyTokenSeries
      // chains a further .orderBy() — mockReturnThis() here lets both shapes
      // work, since a per-test mockResolvedValueOnce on groupBy still takes
      // priority for the tests that need it to be the terminal call.
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsageService, { provide: DATABASE, useValue: mockDb }],
    }).compile();

    service = module.get<UsageService>(UsageService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('record', () => {
    it('inserts a usage event with the given type, quantity, and metadata', async () => {
      mockDb.values.mockResolvedValueOnce(undefined);

      await service.record(
        organizationId,
        USAGE_EVENT_TYPES.CHAT_COMPLETION,
        42,
        { agentId: 'agent-1' },
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        organizationId,
        eventType: USAGE_EVENT_TYPES.CHAT_COMPLETION,
        quantity: 42,
        metadata: { agentId: 'agent-1' },
      });
    });

    it('logs and swallows the error instead of throwing when the insert fails', async () => {
      mockDb.values.mockRejectedValueOnce(new Error('connection lost'));
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.record(organizationId, USAGE_EVENT_TYPES.EMBEDDING, 5),
      ).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('connection lost'),
      );
    });
  });

  describe('summary', () => {
    it('groups totals by event type since the given date', async () => {
      const rows = [
        { eventType: 'chat_completion', totalQuantity: 100, eventCount: 4 },
      ];
      mockDb.groupBy.mockResolvedValueOnce(rows);

      const since = new Date('2026-09-01T00:00:00Z');
      const result = await service.summary(organizationId, since);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.groupBy).toHaveBeenCalled();
      expect(result).toEqual(rows);
    });
  });

  describe('summaryByAgent', () => {
    it('groups totals by agentId (from metadata) and event type, including a null-agentId bucket', async () => {
      const rows = [
        {
          agentId: 'agent-1',
          eventType: 'chat_completion',
          totalQuantity: 100,
          eventCount: 4,
        },
        {
          agentId: null,
          eventType: 'embedding',
          totalQuantity: 12,
          eventCount: 2,
        },
      ];
      mockDb.groupBy.mockResolvedValueOnce(rows);

      const since = new Date('2026-09-01T00:00:00Z');
      const result = await service.summaryByAgent(organizationId, since);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.groupBy).toHaveBeenCalled();
      expect(result).toEqual(rows);
    });
  });

  describe('dailyTokenSeries', () => {
    it('returns one row per day, ordered oldest first', async () => {
      const rows = [
        { day: '2026-09-13', totalTokens: 50 },
        { day: '2026-09-14', totalTokens: 130 },
      ];
      mockDb.orderBy.mockResolvedValueOnce(rows);

      const since = new Date('2026-09-01T00:00:00Z');
      const result = await service.dailyTokenSeries(organizationId, since);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.groupBy).toHaveBeenCalled();
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(result).toEqual(rows);
    });
  });
});
