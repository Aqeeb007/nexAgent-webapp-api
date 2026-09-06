import { Module } from '@nestjs/common';

import { AgentDocumentsController } from './agent-documents.controller';
import { AgentDocumentsService } from './agent-documents.service';

import { RbacModule } from '../rbac/rbac.module';
import { AgentsModule } from '../agents/agents.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [RbacModule, AgentsModule, DocumentsModule],

  controllers: [AgentDocumentsController],

  providers: [AgentDocumentsService],

  exports: [AgentDocumentsService],
})
export class AgentDocumentsModule {}
