import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { OrganizationMembersService } from './organization-members.service';
import { RolesService } from '../rbac/roles.service';
import { DATABASE } from '../database/database.module';
import { ROLES } from '../rbac/constants/roles';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let mockTx: {
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
  };
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    returning: jest.Mock;
    transaction: jest.Mock;
  };
  let mockRolesService: { findBySlugOrThrow: jest.Mock };
  let mockOrganizationMembersService: { addMember: jest.Mock };

  beforeEach(async () => {
    mockTx = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      transaction: jest.fn((callback) => callback(mockTx)),
    };
    mockRolesService = { findBySlugOrThrow: jest.fn() };
    mockOrganizationMembersService = { addMember: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: DATABASE, useValue: mockDb },
        { provide: RolesService, useValue: mockRolesService },
        {
          provide: OrganizationMembersService,
          useValue: mockOrganizationMembersService,
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('inserts and returns the new organization', async () => {
      const org = { id: 'org-1', name: 'Acme', slug: 'acme-abcd1234' };
      mockDb.returning.mockResolvedValueOnce([org]);

      const result = await service.create({ name: 'Acme' });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme' }),
      );
      expect(result).toEqual(org);
    });

    it('throws ConflictException when the generated slug collides', async () => {
      mockDb.returning.mockRejectedValueOnce({ code: '23505' });

      await expect(service.create({ name: 'Acme' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('runs against the given transaction when provided', async () => {
      const org = { id: 'org-1', name: 'Acme', slug: 'acme-abcd1234' };
      const tx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValueOnce([org]),
      };

      const result = await service.create(
        { name: 'Acme' },
        tx as unknown as Parameters<typeof service.create>[1],
      );

      expect(tx.insert).toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result).toEqual(org);
    });
  });

  describe('createOwned', () => {
    const org = { id: 'org-1', name: 'Acme', slug: 'acme-abcd1234' };
    const ownerRole = { id: 'role-owner', name: 'Owner', slug: 'owner' };

    it('opens its own transaction and creates the org + owner membership', async () => {
      mockTx.returning.mockResolvedValueOnce([org]);
      mockRolesService.findBySlugOrThrow.mockResolvedValueOnce(ownerRole);
      mockOrganizationMembersService.addMember.mockResolvedValueOnce({
        id: 'member-1',
      });

      const result = await service.createOwned('Acme', 'user-1');

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockRolesService.findBySlugOrThrow).toHaveBeenCalledWith(
        ROLES.OWNER,
        mockTx,
      );
      expect(mockOrganizationMembersService.addMember).toHaveBeenCalledWith(
        org.id,
        'user-1',
        ownerRole.id,
        mockTx,
      );
      expect(result).toEqual(org);
    });

    it('reuses the given transaction instead of opening a new one', async () => {
      const tx = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        returning: jest.fn().mockResolvedValueOnce([org]),
      };
      mockRolesService.findBySlugOrThrow.mockResolvedValueOnce(ownerRole);
      mockOrganizationMembersService.addMember.mockResolvedValueOnce({
        id: 'member-1',
      });

      const result = await service.createOwned(
        'Acme',
        'user-1',
        tx as unknown as Parameters<typeof service.createOwned>[2],
      );

      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(tx.insert).toHaveBeenCalled();
      expect(result).toEqual(org);
    });

    it('propagates InternalServerErrorException when the owner role is not seeded', async () => {
      mockTx.returning.mockResolvedValueOnce([org]);
      mockRolesService.findBySlugOrThrow.mockRejectedValueOnce(
        new InternalServerErrorException('Role not configured: owner'),
      );

      await expect(service.createOwned('Acme', 'user-1')).rejects.toThrow(
        InternalServerErrorException,
      );
      expect(mockOrganizationMembersService.addMember).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the organization when found', async () => {
      const org = { id: 'org-1', name: 'Acme', slug: 'acme-abcd1234' };
      mockDb.limit.mockResolvedValueOnce([org]);

      const result = await service.findById('org-1');

      expect(result).toEqual(org);
    });

    it('returns null when not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findById('missing');

      expect(result).toBeNull();
    });
  });

  describe('findUserOrganizations', () => {
    it('returns the orgs the user belongs to, with role', async () => {
      const rows = [
        {
          id: 'org-1',
          name: 'Acme',
          slug: 'acme-x',
          role: { id: 'role-1', name: 'Owner', slug: 'owner' },
        },
      ];
      mockDb.where.mockResolvedValueOnce(rows);

      const result = await service.findUserOrganizations('user-1');

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalledTimes(2);
      expect(result).toEqual(rows);
    });
  });
});
