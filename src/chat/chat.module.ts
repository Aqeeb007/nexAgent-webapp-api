import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';

import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { ConversationsService } from './conversations.service';

import { RbacModule } from '../rbac/rbac.module';
import { AgentsModule } from '../agents/agents.module';
import { AgentToolsModule } from '../agent-tools/agent-tools.module';
import { ToolsModule } from '../tools/tools.module';
import { OpenAiModule } from '../openai/openai.module';

@Module({
  imports: [
    RbacModule,
    AgentsModule,
    AgentToolsModule,
    ToolsModule,
    OpenAiModule,
    // Registered locally (mirrors AuthModule's own JwtModule.registerAsync)
    // rather than importing AuthModule, which would pull in
    // UsersModule/OrganizationsModule as an unwanted transitive dependency
    // just to verify a token's signature on the gateway's handshake.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.get<string>('jwt.accessSecret'),
      }),
    }),
  ],

  controllers: [ChatController],

  providers: [ChatService, ConversationsService, ChatGateway],
})
export class ChatModule {}
