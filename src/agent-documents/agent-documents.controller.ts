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

import { AgentDocumentsService } from './agent-documents.service';
import { AttachDocumentDto } from './dto/attach-document.dto';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';

@Controller('agents/:agentId/documents')
@UseGuards(PermissionGuard)
export class AgentDocumentsController {
  constructor(private readonly agentDocumentsService: AgentDocumentsService) {}

  @Post()
  @RequirePermission(PERMISSIONS.AGENT_UPDATE)
  attach(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Body() dto: AttachDocumentDto,
  ) {
    return this.agentDocumentsService.attach(
      agentId,
      dto.documentId,
      organizationId,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  list(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
  ) {
    return this.agentDocumentsService.list(agentId, organizationId);
  }

  @Delete(':documentId')
  @RequirePermission(PERMISSIONS.AGENT_UPDATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async detach(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    const removed = await this.agentDocumentsService.detach(
      agentId,
      documentId,
      organizationId,
    );

    if (!removed) {
      throw new NotFoundException('Document is not attached to this agent');
    }
  }
}
