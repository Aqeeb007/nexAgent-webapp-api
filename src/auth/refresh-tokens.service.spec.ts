import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RefreshTokensService } from './refresh-tokens.service';
import { DATABASE } from '../database/database.module';

describe('RefreshTokensService', () => {
  let service: RefreshTokensService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokensService,
        { provide: DATABASE, useValue: mockDb },
      ],
    }).compile();

    service = module.get<RefreshTokensService>(RefreshTokensService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const expiresAt = new Date('2099-01-01T00:00:00Z');

    it('inserts a row against the default db when no transaction is given', async () => {
      mockDb.values.mockResolvedValueOnce(undefined);

      await service.create('user-1', 'hashed-token', expiresAt);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith({
        userId: 'user-1',
        tokenHash: 'hashed-token',
        expiresAt,
      });
    });

    it('inserts against the given transaction when one is provided', async () => {
      const mockTx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockResolvedValueOnce(undefined),
      };

      await service.create(
        'user-1',
        'hashed-token',
        expiresAt,
        mockTx as unknown as Parameters<typeof service.create>[3],
      );

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the DB rejects a duplicate token hash', async () => {
      mockDb.values.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.create('user-1', 'hashed-token', expiresAt),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows unrelated database errors', async () => {
      const dbError = new Error('connection lost');
      mockDb.values.mockRejectedValueOnce(dbError);

      await expect(
        service.create('user-1', 'hashed-token', expiresAt),
      ).rejects.toThrow(dbError);
    });
  });

  describe('findValidByHash', () => {
    it('returns the row when a valid, unrevoked, unexpired token is found', async () => {
      const row = { id: 'token-1', userId: 'user-1' };
      mockDb.limit.mockResolvedValueOnce([row]);

      const result = await service.findValidByHash('hashed-token');

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual(row);
    });

    it('returns null when nothing matches', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findValidByHash('hashed-token');

      expect(result).toBeNull();
    });
  });

  describe('revokeByHash', () => {
    it('updates revokedAt against the default db when no transaction is given', async () => {
      mockDb.where.mockResolvedValueOnce(undefined);

      await service.revokeByHash('hashed-token');

      expect(mockDb.update).toHaveBeenCalled();
      const [setArg] = mockDb.set.mock.calls[0] as [{ revokedAt: Date }];
      expect(setArg.revokedAt).toBeInstanceOf(Date);
    });

    it('updates against the given transaction when one is provided', async () => {
      const mockTx = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValueOnce(undefined),
      };

      await service.revokeByHash(
        'hashed-token',
        mockTx as unknown as Parameters<typeof service.revokeByHash>[1],
      );

      expect(mockTx.update).toHaveBeenCalled();
      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
