import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { AgentToolsService } from './agent-tools.service';
import { AttachToolDto } from './dto/attach-tool.dto';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';

@Controller('agents/:agentId/tools')
@UseGuards(PermissionGuard)
export class AgentToolsController {
  constructor(private readonly agentToolsService: AgentToolsService) {}

  @Post()
  @RequirePermission(PERMISSIONS.AGENT_UPDATE)
  attach(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: AttachToolDto,
  ) {
    return this.agentToolsService.attach(agentId, dto.toolId, organizationId);
  }

  @Get()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  list(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ) {
    return this.agentToolsService.list(agentId, organizationId);
  }

  @Delete(':toolId')
  @RequirePermission(PERMISSIONS.AGENT_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('toolId', ParseUUIDPipe) toolId: string,
  ) {
    const removed = await this.agentToolsService.detach(
      agentId,
      toolId,
      organizationId,
    );

    if (!removed) {
      throw new NotFoundException('Tool is not attached to this agent');
    }
  }
}
