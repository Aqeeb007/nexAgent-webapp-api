import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { OrganizationMembersService } from './organization-members.service';
import { UsersService } from '../users/users.service';
import { RolesService } from '../rbac/roles.service';
import { DATABASE } from '../database/database.module';

describe('OrganizationMembersService', () => {
  let service: OrganizationMembersService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
  };
  let mockUsersService: { findByEmail: jest.Mock };
  let mockRolesService: { findBySlugOrThrow: jest.Mock };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    mockUsersService = { findByEmail: jest.fn() };
    mockRolesService = { findBySlugOrThrow: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationMembersService,
        { provide: DATABASE, useValue: mockDb },
        { provide: UsersService, useValue: mockUsersService },
        { provide: RolesService, useValue: mockRolesService },
      ],
    }).compile();

    service = module.get<OrganizationMembersService>(
      OrganizationMembersService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addMember', () => {
    it('inserts and returns the new membership', async () => {
      const membership = {
        id: 'member-1',
        organizationId: 'org-1',
        userId: 'user-1',
        roleId: 'role-1',
      };
      mockDb.returning.mockResolvedValueOnce([membership]);

      const result = await service.addMember('org-1', 'user-1', 'role-1');

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(membership);
    });

    it('throws ConflictException when the user is already a member', async () => {
      mockDb.returning.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.addMember('org-1', 'user-1', 'role-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addMemberByEmail', () => {
    it('resolves the user and role, then creates the membership', async () => {
      const user = { id: 'user-2', email: 'bob@example.com' };
      const role = { id: 'role-admin', name: 'Admin', slug: 'admin' };
      const membership = {
        id: 'member-2',
        organizationId: 'org-1',
        userId: user.id,
        roleId: role.id,
      };
      mockUsersService.findByEmail.mockResolvedValueOnce(user);
      mockRolesService.findBySlugOrThrow.mockResolvedValueOnce(role);
      mockDb.returning.mockResolvedValueOnce([membership]);

      const result = await service.addMemberByEmail(
        'org-1',
        'bob@example.com',
        'admin',
      );

      expect(mockRolesService.findBySlugOrThrow).toHaveBeenCalledWith(
        'admin',
        undefined,
      );
      expect(result).toEqual(membership);
    });

    it('throws NotFoundException when no account exists for that email', async () => {
      mockUsersService.findByEmail.mockResolvedValueOnce(null);

      await expect(
        service.addMemberByEmail('org-1', 'nobody@example.com', 'member'),
      ).rejects.toThrow(NotFoundException);
      expect(mockRolesService.findBySlugOrThrow).not.toHaveBeenCalled();
    });
  });

  describe('listMembers', () => {
    it('returns members joined with user and role info', async () => {
      const rows = [
        {
          id: 'member-1',
          userId: 'user-1',
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          role: { id: 'role-owner', name: 'Owner', slug: 'owner' },
          joinedAt: new Date(),
        },
      ];
      mockDb.where.mockResolvedValueOnce(rows);

      const result = await service.listMembers('org-1');

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalledTimes(2);
      expect(result).toEqual(rows);
    });
  });
});
