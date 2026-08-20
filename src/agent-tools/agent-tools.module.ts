import { Module } from '@nestjs/common';

import { AgentToolsController } from './agent-tools.controller';
import { AgentToolsService } from './agent-tools.service';

import { RbacModule } from '../rbac/rbac.module';
import { AgentsModule } from '../agents/agents.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [RbacModule, AgentsModule, ToolsModule],

  controllers: [AgentToolsController],

  providers: [AgentToolsService],
})
export class AgentToolsModule {}
