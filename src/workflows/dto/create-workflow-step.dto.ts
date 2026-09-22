import { IsIn, IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class CreateWorkflowStepDto {
  @IsIn(['agent', 'tool', 'condition'])
  type!: string;

  // Deep-shape validation happens in validateStepConfig (called from
  // WorkflowsController), which picks the concrete config DTO based on
  // `type` and validates against that — config's shape genuinely varies by
  // type, so it can't be a single fixed nested DTO here (mirrors
  // tools/dto/create-tool.dto.ts's `config` field).
  @IsObject()
  config!: Record<string, unknown>;

  // Position in the workflow's linear pipeline. Omit to append at the end
  // (WorkflowsService assigns current max + 1).
  @IsOptional()
  @IsInt()
  @Min(0)
  stepOrder?: number;
}
