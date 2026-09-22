import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AgentStepConfigDto {
  @IsUUID()
  agentId!: string;

  // The literal placeholder {{input}} is replaced with the current
  // pipeline input (the previous step's output, or the run's initial input
  // for the first step) — see execution/template.util.ts. Omit to send the
  // raw stringified input verbatim as the user message.
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  promptTemplate?: string;
}
