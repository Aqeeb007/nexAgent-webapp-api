import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const CONDITION_OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'truthy',
  'falsy',
] as const;

export class ConditionCaseDto {
  // Matched against outgoing edges' `branch` at execution time
  // (WorkflowExecutionService) — the first case whose operator matches
  // wins, and its branch decides which edge is followed next.
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  branch!: string;

  @IsIn(CONDITION_OPERATORS)
  operator!: (typeof CONDITION_OPERATORS)[number];

  // Not deeply validated — comparison value can be any JSON-serializable
  // shape, same "opaque jsonb, checked at execution time" posture as tool
  // args.
  @IsOptional()
  value?: unknown;
}

export class ConditionStepConfigDto {
  // Dot-notation path into the current pipeline input (e.g. "ok" or
  // "body.status"), shared by every case below. Omit to evaluate the whole
  // input value.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string;

  // Evaluated in order; the first matching case's branch is the step's
  // output. No match -> branch: null, and execution falls back to a
  // 'default'-branched edge if one exists, else the path ends there.
  @ValidateNested({ each: true })
  @Type(() => ConditionCaseDto)
  @ArrayMinSize(1)
  cases!: ConditionCaseDto[];
}
