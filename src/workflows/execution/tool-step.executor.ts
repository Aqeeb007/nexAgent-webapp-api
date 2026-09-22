import { Injectable, NotFoundException } from '@nestjs/common';

import { ToolsService } from '../../tools/tools.service';
import { UsageService } from '../../usage/usage.service';
import { USAGE_EVENT_TYPES } from '../../usage/constants/usage-event-types';

import { resolveArgs } from './template.util';
import type {
  WorkflowStepExecutionContext,
  WorkflowStepExecutor,
} from './workflow-step-executor.interface';

@Injectable()
export class ToolStepExecutor implements WorkflowStepExecutor {
  constructor(
    private readonly toolsService: ToolsService,
    private readonly usageService: UsageService,
  ) {}

  async execute(
    config: Record<string, unknown>,
    input: unknown,
    ctx: WorkflowStepExecutionContext,
  ): Promise<{ output: unknown }> {
    const toolId = config.toolId as string;
    const args = config.args as Record<string, unknown> | undefined;

    const tool = await this.toolsService.findOne(toolId, ctx.organizationId);

    if (!tool) {
      throw new NotFoundException(`Tool not found: ${toolId}`);
    }

    // ToolsService.execute never throws for ordinary HTTP/network failures
    // ({ok, status, body} instead) — that result is the step's output
    // either way, success or failure alike; only an unexpected throw (e.g.
    // an unsupported tool type) fails the step.
    const result = await this.toolsService.execute(
      tool,
      resolveArgs(args, input),
    );

    await this.usageService.record(
      ctx.organizationId,
      USAGE_EVENT_TYPES.TOOL_EXECUTION,
      1,
      { toolId, toolName: tool.name, source: 'workflow_step' },
    );

    return { output: result };
  }
}
