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

import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

import { PermissionGuard } from '../rbac/guards/permission.guard';
import { RequirePermission } from '../rbac/decorators/require-permission.decorator';
import { PERMISSIONS } from '../rbac/constants/permissions';

import { OrganizationId } from '../common/decorators/organization-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/types/express';

@Controller('agents/:agentId/conversations')
@UseGuards(PermissionGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  createConversation(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.createConversation(
      agentId,
      organizationId,
      user.id,
    );
  }

  @Get()
  @RequirePermission(PERMISSIONS.AGENT_READ)
  listConversations(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.listConversations(agentId, organizationId, user.id);
  }

  @Post(':conversationId/messages')
  @RequirePermission(PERMISSIONS.AGENT_READ)
  sendMessage(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      agentId,
      conversationId,
      organizationId,
      user.id,
      dto.message,
      (event) => this.chatGateway.emitStep(conversationId, event),
    );
  }

  @Get(':conversationId/messages')
  @RequirePermission(PERMISSIONS.AGENT_READ)
  getMessages(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.getMessages(
      agentId,
      conversationId,
      organizationId,
      user.id,
    );
  }

  @Delete(':conversationId')
  @RequirePermission(PERMISSIONS.AGENT_READ)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConversation(
    @OrganizationId() organizationId: string,
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chatService.deleteConversation(
      agentId,
      conversationId,
      organizationId,
      user.id,
    );
  }
}
