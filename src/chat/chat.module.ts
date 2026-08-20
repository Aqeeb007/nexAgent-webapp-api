import { Module } from '@nestjs/common';

import { ChatController } from './chat.controller';
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
  ],

  controllers: [ChatController],

  providers: [ChatService, ConversationsService],
})
export class ChatModule {}
