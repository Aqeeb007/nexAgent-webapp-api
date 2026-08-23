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
import type { ChatStepEvent } from './chat.service';
import { ConversationsService } from './conversations.service';
import { JoinConversationDto } from './dto/join-conversation.dto';

// socket.io's Socket.data is untyped (any) by default — intersecting with
// Socket directly would still collapse to any, so data is Omit-and-replaced
// instead to actually narrow client.data.userId.
type AuthenticatedSocket = Omit<Socket, 'data'> & {
  data: { userId?: string };
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
  ) {}

  // No HTTP request exists here for the global JwtAuthGuard to intercept —
  // a socket with a missing or invalid access token is disconnected before
  // it can subscribe to anything.
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token = client.handshake.auth?.token as string | undefined;

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
        { secret: this.configService.get<string>('jwt.accessSecret') },
      );
      client.data.userId = payload.sub;
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

  // The only integration point ChatService needs: every emit goes through
  // Socket.IO's own room/adapter abstraction, never a hand-rolled socket
  // registry, so scaling this to multiple instances later is a matter of
  // attaching a Redis adapter in main.ts, not rewriting this gateway.
  emitStep(conversationId: string, event: ChatStepEvent): void {
    this.server.to(`conversation:${conversationId}`).emit(event.type, event);
  }
}
