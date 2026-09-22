import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateWorkflowEdgeDto {
  @IsUUID()
  fromStepId!: string;

  @IsUUID()
  toStepId!: string;

  // Defaults to 'default' server-side (WorkflowsService.addEdge) when
  // omitted — the label a non-condition step's one outgoing edge uses. A
  // condition step's edges should be branched to match one of its
  // config.cases[].branch values (not enforced here — see the plan's note
  // on keeping edges decoupled from step-type-specific config).
  @IsOptional()
  @IsString()
  @MaxLength(50)
  branch?: string;
}
