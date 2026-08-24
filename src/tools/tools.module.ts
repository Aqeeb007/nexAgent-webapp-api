import { Module } from '@nestjs/common';

import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { HttpToolExecutor } from './executors/http-tool.executor';
import { DatabaseToolExecutor } from './executors/database-tool.executor';
import { CustomJsToolExecutor } from './executors/custom-js-tool.executor';
import { ToolExecutorRegistry } from './executors/tool-executor.registry';

import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [RbacModule],

  controllers: [ToolsController],

  providers: [
    ToolsService,
    HttpToolExecutor,
    DatabaseToolExecutor,
    CustomJsToolExecutor,
    ToolExecutorRegistry,
  ],

  exports: [ToolsService],
})
export class ToolsModule {}
