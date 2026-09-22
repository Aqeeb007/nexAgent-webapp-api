import { Injectable } from '@nestjs/common';

import { AgentStepExecutor } from './agent-step.executor';
import { ToolStepExecutor } from './tool-step.executor';
import { ConditionStepExecutor } from './condition-step.executor';
import { WorkflowStepExecutor } from './workflow-step-executor.interface';

@Injectable()
export class WorkflowStepExecutorRegistry {
  private readonly executors: Record<string, WorkflowStepExecutor>;

  constructor(
    agent: AgentStepExecutor,
    tool: ToolStepExecutor,
    condition: ConditionStepExecutor,
  ) {
    this.executors = {
      agent,
      tool,
      condition,
    };
  }

  get(type: string): WorkflowStepExecutor {
    const executor = this.executors[type];

    if (!executor) {
      throw new Error(`Unsupported workflow step type: ${type}`);
    }

    return executor;
  }
}
