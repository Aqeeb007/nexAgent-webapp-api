import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { DATABASE } from '../database/database.module';

describe('RolesService', () => {
  let service: RolesService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: DATABASE, useValue: mockDb }],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findBySlugOrThrow', () => {
    it('returns the role when the slug is seeded', async () => {
      const role = { id: 'role-1', name: 'Owner', slug: 'owner' };
      mockDb.limit.mockResolvedValueOnce([role]);

      const result = await service.findBySlugOrThrow('owner');

      expect(result).toEqual(role);
    });

    it('throws InternalServerErrorException when the slug is not seeded', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.findBySlugOrThrow('nonexistent')).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('queries against the given transaction when one is provided', async () => {
      const role = { id: 'role-1', name: 'Owner', slug: 'owner' };
      const mockTx = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValueOnce([role]),
      };

      const result = await service.findBySlugOrThrow(
        'owner',
        mockTx as unknown as Parameters<typeof service.findBySlugOrThrow>[1],
      );

      expect(mockTx.select).toHaveBeenCalled();
      expect(mockDb.select).not.toHaveBeenCalled();
      expect(result).toEqual(role);
    });
  });
});
