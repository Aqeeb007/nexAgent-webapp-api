import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationMembersService } from './organization-members.service';
import { RbacService } from '../rbac/rbac.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let organizationsService: {
    createOwned: jest.Mock;
    findUserOrganizations: jest.Mock;
    findById: jest.Mock;
  };
  let organizationMembersService: {
    addMemberByEmail: jest.Mock;
    listMembers: jest.Mock;
  };

  const currentUser = { id: 'user-1' };

  beforeEach(async () => {
    organizationsService = {
      createOwned: jest.fn(),
      findUserOrganizations: jest.fn(),
      findById: jest.fn(),
    };
    organizationMembersService = {
      addMemberByEmail: jest.fn(),
      listMembers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: organizationsService },
        {
          provide: OrganizationMembersService,
          useValue: organizationMembersService,
        },
        // The controller carries @UseGuards(PermissionGuard) as class
        // metadata, so Nest instantiates PermissionGuard as part of
        // compiling this module even though these tests call controller
        // methods directly and never actually run the guard.
        Reflector,
        { provide: RbacService, useValue: {} },
      ],
    }).compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to OrganizationsService.createOwned with the caller as owner', async () => {
      const org = { id: 'org-1', name: 'Acme', slug: 'acme-x' };
      organizationsService.createOwned.mockResolvedValue(org);

      const result = await controller.create({ name: 'Acme' }, currentUser);

      expect(organizationsService.createOwned).toHaveBeenCalledWith(
        'Acme',
        currentUser.id,
      );
      expect(result).toEqual(org);
    });
  });

  describe('findMine', () => {
    it('delegates to OrganizationsService.findUserOrganizations for the caller', async () => {
      const orgs = [{ id: 'org-1', name: 'Acme', slug: 'acme-x' }];
      organizationsService.findUserOrganizations.mockResolvedValue(orgs);

      const result = await controller.findMine(currentUser);

      expect(organizationsService.findUserOrganizations).toHaveBeenCalledWith(
        currentUser.id,
      );
      expect(result).toEqual(orgs);
    });
  });

  describe('findCurrent', () => {
    it('returns the organization for the given org id', async () => {
      const org = { id: 'org-1', name: 'Acme', slug: 'acme-x' };
      organizationsService.findById.mockResolvedValue(org);

      const result = await controller.findCurrent('org-1');

      expect(organizationsService.findById).toHaveBeenCalledWith('org-1');
      expect(result).toEqual(org);
    });

    it('throws NotFoundException when the organization is missing', async () => {
      organizationsService.findById.mockResolvedValue(null);

      await expect(controller.findCurrent('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addMember', () => {
    it('delegates to OrganizationMembersService.addMemberByEmail', async () => {
      const membership = { id: 'member-1' };
      organizationMembersService.addMemberByEmail.mockResolvedValue(membership);

      const result = await controller.addMember('org-1', {
        email: 'bob@example.com',
        role: 'member',
      });

      expect(organizationMembersService.addMemberByEmail).toHaveBeenCalledWith(
        'org-1',
        'bob@example.com',
        'member',
      );
      expect(result).toEqual(membership);
    });
  });

  describe('listMembers', () => {
    it('delegates to OrganizationMembersService.listMembers', async () => {
      const members = [{ id: 'member-1' }];
      organizationMembersService.listMembers.mockResolvedValue(members);

      const result = await controller.listMembers('org-1');

      expect(organizationMembersService.listMembers).toHaveBeenCalledWith(
        'org-1',
      );
      expect(result).toEqual(members);
    });
  });
});
