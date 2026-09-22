import { Module } from '@nestjs/common';

import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';
import { WorkflowExecutionService } from './workflow-execution.service';

import { AgentStepExecutor } from './execution/agent-step.executor';
import { ToolStepExecutor } from './execution/tool-step.executor';
import { ConditionStepExecutor } from './execution/condition-step.executor';
import { WorkflowStepExecutorRegistry } from './execution/workflow-step-executor.registry';

import { RbacModule } from '../rbac/rbac.module';
import { AgentsModule } from '../agents/agents.module';
import { ToolsModule } from '../tools/tools.module';
import { OpenAiModule } from '../openai/openai.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [RbacModule, AgentsModule, ToolsModule, OpenAiModule, UsageModule],

  controllers: [WorkflowsController],

  providers: [
    WorkflowsService,
    WorkflowExecutionService,
    AgentStepExecutor,
    ToolStepExecutor,
    ConditionStepExecutor,
    WorkflowStepExecutorRegistry,
  ],

  exports: [WorkflowsService],
})
export class WorkflowsModule {}
