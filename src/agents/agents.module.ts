import { Module } from '@nestjs/common';

import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],

  controllers: [AgentsController],

  providers: [AgentsService],

  exports: [AgentsService],
})
export class AgentsModule {}
