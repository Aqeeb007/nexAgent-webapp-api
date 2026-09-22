import { IsObject, IsOptional } from 'class-validator';

export class ExecuteWorkflowDto {
  // Seeds the pipeline's initial input (what the first step's {{input}}
  // resolves to). Left free-form (opaque jsonb) since the first step could
  // be any of the three step types.
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}
