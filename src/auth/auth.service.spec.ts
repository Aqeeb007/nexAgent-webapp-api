import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { DATABASE } from '../database/database.module';

jest.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;

  // register() runs everything inside `this.db.transaction(async (tx) => ...)`.
  // mockTx stands in for the `tx` query builder passed into that callback;
  // mockDb.transaction just invokes the callback with it, the same way the
  // real Drizzle transaction() does.
  let mockTx: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
  };
  let mockDb: { transaction: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    mockDb = {
      transaction: jest.fn((callback) => callback(mockTx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService, { provide: DATABASE, useValue: mockDb }],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    const registerDto = {
      email: 'Jane@Example.com',
      password: 'plainPassword123',
      firstName: 'Jane',
      lastName: 'Doe',
    };

    const insertedUser = {
      id: 'user-1',
      email: 'jane@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
      emailVerified: false,
    };
    const insertedOrganization = {
      id: 'org-1',
      name: "Jane's Organization",
      slug: 'jane-abcd1234',
    };
    const ownerRole = { id: 'role-owner' };

    it('creates the user, their organization, and an owner membership', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockTx.limit
        .mockResolvedValueOnce([]) // 1st select+limit: no existing user with this email
        .mockResolvedValueOnce([ownerRole]); // 2nd select+limit: the "owner" role lookup
      mockTx.returning
        .mockResolvedValueOnce([insertedUser]) // 1st insert+returning: the new user row
        .mockResolvedValueOnce([insertedOrganization]); // 2nd insert+returning: the new org row

      const result = await service.register(registerDto);

      // Never store the plain-text password, only the bcrypt hash
      expect(bcrypt.hash).toHaveBeenCalledWith(registerDto.password, 12);
      expect(mockTx.values).toHaveBeenCalledWith(
        expect.objectContaining({ passwordHash: 'hashed-password' }),
      );
      expect(mockTx.values).not.toHaveBeenCalledWith(
        expect.objectContaining({ password: registerDto.password }),
      );

      // The membership ties the new user to the new org via the owner role
      expect(mockTx.values).toHaveBeenCalledWith({
        userId: insertedUser.id,
        organizationId: insertedOrganization.id,
        roleId: ownerRole.id,
      });

      expect(result).toEqual({
        user: insertedUser,
        organization: insertedOrganization,
      });
    });

    it('throws ConflictException and creates nothing when the email is already registered', async () => {
      mockTx.limit.mockResolvedValueOnce([{ id: 'existing-user' }]); // email already exists

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockTx.insert).not.toHaveBeenCalled();
    });

    it('throws InternalServerErrorException when the "owner" role is not seeded', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      mockTx.limit
        .mockResolvedValueOnce([]) // no existing user
        .mockResolvedValueOnce([]); // owner role missing
      mockTx.returning
        .mockResolvedValueOnce([insertedUser])
        .mockResolvedValueOnce([insertedOrganization]);

      await expect(service.register(registerDto)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
