import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/express';

@Controller('agents/:agentId/chat')
@UseGuards(PermissionGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  sendMessage(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      agentId,
      organizationId,
      user.id,
      dto.message,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  getHistory(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.getHistory(agentId, organizationId, user.id);
  }

  @Delete()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  @HttpCode(HttpStatus.NO_CONTENT)
  resetConversation(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.resetConversation(agentId, organizationId, user.id);
  }
}
