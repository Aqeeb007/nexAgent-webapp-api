export interface WorkflowStepExecutionContext {
  organizationId: string;
  userId: string;
}

export interface WorkflowStepExecutor {
  execute(
    config: Record<string, unknown>,
    input: unknown,
    ctx: WorkflowStepExecutionContext,
  ): Promise<{ output: unknown }>;
}
