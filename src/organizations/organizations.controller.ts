import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';

import { OrganizationsService } from './organizations.service';
import { OrganizationMembersService } from './organization-members.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrganizationId } from '../common/decorators/organization-id.decorator';
import type { AuthenticatedUser } from '../common/types/express';

@Controller('organizations')
@UseGuards(PermissionGuard)
export class OrganizationsController {
  constructor(
    private readonly organizationsService: OrganizationsService,
    private readonly organizationMembersService: OrganizationMembersService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateOrganizationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.organizationsService.createOwned(dto.name, user.id);
  }

  @Get()
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.findUserOrganizations(user.id);
  }

  @Get('current')
  @RequirePermission(PERMISSIONS.ORGANIZATION_READ)
  async findCurrent(@OrganizationId() organizationId: string) {
    const organization =
      await this.organizationsService.findById(organizationId);

    // Should be unreachable — PermissionGuard already required an active
    // membership row for this org — but don't silently 200 with null if it
    // ever happens.
    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  @Post('members')
  @RequirePermission(PERMISSIONS.MEMBER_INVITE)
  addMember(
    @OrganizationId() organizationId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.organizationMembersService.addMemberByEmail(
      organizationId,
      dto.email,
      dto.role,
    );
  }

  @Get('members')
  @RequirePermission(PERMISSIONS.MEMBER_READ)
  listMembers(@OrganizationId() organizationId: string) {
    return this.organizationMembersService.listMembers(organizationId);
  }
}
