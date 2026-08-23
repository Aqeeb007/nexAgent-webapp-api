import { UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import type { AccessTokenPayload } from '../auth/token.service';
import { PERMISSIONS } from '../rbac/constants/permissions';
import { RbacService } from '../rbac/rbac.service';
import { ChatService, type ChatStepEvent } from './chat.service';
import { ConversationsService } from './conversations.service';
import { JoinConversationDto } from './dto/join-conversation.dto';
import { SendConversationMessageDto } from './dto/send-conversation-message.dto';

// socket.io's Socket.data is untyped (any) by default — intersecting with
// Socket directly would still collapse to any, so data is Omit-and-replaced
// instead to actually narrow client.data.userId/organizationId.
type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: { userId?: string; organizationId?: string };
};

// Decorator options are evaluated at class-load time, before Nest's DI
// container exists, so this reads process.env directly rather than going
// through ConfigService — the same accepted exception documented in
// database.ts for the same reason.
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
    private readonly chatService: ChatService,
    private readonly rbacService: RbacService,
  ) {}

  // No HTTP request exists here for the global JwtAuthGuard/PermissionGuard
  // to intercept — a socket with a missing/invalid token or no organization
  // context is disconnected before it can subscribe to or send anything.
  // organizationId travels the same way the frontend already sends it over
  // HTTP (the X-Organization-Id header) — just via the handshake auth
  // payload instead, since individual socket events don't carry headers.
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;
    const organizationId = client.handshake.auth?.organizationId as
      string | undefined;

    if (!token || !organizationId) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: this.configService.get<string>('jwt.accessSecret') },
      );
      client.data.userId = payload.sub;
      client.data.organizationId = organizationId;
    } catch {
      client.disconnect(true);
    }
  }

  // Ownership check reuses ConversationsService.findOwned — the same query
  // ChatService itself uses to 404 an unowned conversation over HTTP — so a
  // client can only join the room for a conversation that is actually
  // theirs, never another user's.
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('join')
  async handleJoin(
    @MessageBody() dto: JoinConversationDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    const conversation = await this.conversationsService.findOwned(
      dto.conversationId,
      dto.agentId,
      client.data.userId ?? '',
    );

    if (!conversation) {
      client.emit('error', { message: 'Conversation not found' });
      return;
    }

    await client.join(`conversation:${dto.conversationId}`);
    client.emit('joined', { conversationId: dto.conversationId });
  }

  // Socket-native equivalent of POST .../messages — same RBAC check
  // PermissionGuard would run over HTTP (there's no ExecutionContext here to
  // reuse the guard directly), same ChatService call, same emitStep wiring.
  // Kept as an explicit success/error event pair (rather than a Nest ack
  // callback) so failures are as debuggable and testable as the 'join' flow
  // above, instead of depending on default WS exception-filter behavior.
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() dto: SendConversationMessageDto,
    @ConnectedSocket() client: AuthenticatedSocket,
  ): Promise<void> {
    const { userId, organizationId } = client.data;

    if (!userId || !organizationId) {
      client.emit('sendMessageError', { message: 'Not authenticated' });
      return;
    }

    const allowed = await this.rbacService.hasPermission(
      userId,
      organizationId,
      PERMISSIONS.AGENT_READ,
    );

    if (!allowed) {
      client.emit('sendMessageError', {
        message: 'Insufficient permissions',
      });
      return;
    }

    try {
      const result = await this.chatService.sendMessage(
        dto.agentId,
        dto.conversationId,
        organizationId,
        userId,
        dto.message,
        (event) => this.emitStep(dto.conversationId, event),
      );
      client.emit('messageSent', result);
    } catch (error) {
      client.emit('sendMessageError', {
        message:
          error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  }

  // The only integration point ChatService needs: every emit goes through
  // Socket.IO's own room/adapter abstraction, never a hand-rolled socket
  // registry, so scaling this to multiple instances later is a matter of
  // attaching a Redis adapter in main.ts, not rewriting this gateway.
  emitStep(conversationId: string, event: ChatStepEvent): void {
    this.server.to(`conversation:${conversationId}`).emit(event.type, event);
  }
}
