import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { AgentsService, type AgentInput } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';

@Controller('agents')
@UseGuards(PermissionGuard)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  @RequirePermission(PERMISSIONS.AGENT_CREATE)
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateAgentDto,
  ) {
    // Validated by CreateAgentDto's nested AgentConfigurationDto —
    // AgentsService stores configuration as opaque jsonb.
    return this.agentsService.create(
      organizationId,
      dto as unknown as AgentInput,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  findAll(@OrganizationId() organizationId: string) {
    return this.agentsService.findAllForOrganization(organizationId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.AGENT_READ)
  async findOne(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const agent = await this.agentsService.findOne(id, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.AGENT_UPDATE)
  async update(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    const agent = await this.agentsService.update(
      id,
      organizationId,
      dto as unknown as Partial<AgentInput>,
    );

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.AGENT_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @OrganizationId() organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const removed = await this.agentsService.remove(id, organizationId);

    if (!removed) {
      throw new NotFoundException('Agent not found');
    }
  }
}
