import { Module } from '@nestjs/common';

import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],

  controllers: [ToolsController],

  providers: [ToolsService],

  exports: [ToolsService],
})
export class ToolsModule {}
