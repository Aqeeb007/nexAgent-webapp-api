export interface ToolExecutionResult {
  ok: boolean;
  status: number;
  body: unknown;
  truncated?: boolean;
}

export interface ToolExecutor {
  execute(
    config: Record<string, unknown>,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult>;
}
