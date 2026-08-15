import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { DATABASE } from '../database/database.module';

describe('UsersService', () => {
  let service: UsersService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
  };

  beforeEach(async () => {
    // Drizzle queries are chainable: db.select().from().where().limit().
    // mockReturnThis() makes every link in the chain hand back the same
    // mock object, except the last call, which we control per test.
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: DATABASE, useValue: mockDb }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEmail', () => {
    it('returns the user when one exists with that email', async () => {
      const user = { id: '1', email: 'jane@example.com' };
      mockDb.limit.mockResolvedValueOnce([user]);

      const result = await service.findByEmail('jane@example.com');

      expect(mockDb.where).toHaveBeenCalled();
      expect(result).toEqual(user);
    });

    it('returns null when no user has that email', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findByEmail('missing@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      const user = { id: '1', email: 'jane@example.com' };
      mockDb.limit.mockResolvedValueOnce([user]);

      const result = await service.findById('1');

      expect(result).toEqual(user);
    });

    it('returns null when not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findById('missing-id');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    const newUser = {
      email: 'jane@example.com',
      passwordHash: 'hashed-password',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    it('inserts and returns the new user when the email is free', async () => {
      const insertedUser = {
        id: 'uuid-1',
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        emailVerified: false,
      };
      mockDb.returning.mockResolvedValueOnce([insertedUser]);

      const result = await service.createUser(newUser);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ email: newUser.email }),
      );
      expect(result).toEqual(insertedUser);
    });

    it('throws ConflictException when the DB rejects a duplicate email', async () => {
      mockDb.returning.mockRejectedValueOnce({ code: '23505' });

      await expect(service.createUser(newUser)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows unrelated database errors', async () => {
      const dbError = new Error('connection lost');
      mockDb.returning.mockRejectedValueOnce(dbError);

      await expect(service.createUser(newUser)).rejects.toThrow(dbError);
    });

    it('runs the insert against the given transaction when one is provided', async () => {
      const insertedUser = { id: 'uuid-1', ...newUser };
      const mockTx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValueOnce([insertedUser]),
      };

      const result = await service.createUser(
        newUser,
        mockTx as unknown as Parameters<typeof service.createUser>[1],
      );

      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual(insertedUser);
    });
  });
});
