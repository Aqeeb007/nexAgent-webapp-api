import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

// Mirrors the subset of OpenAI chat completion params an agent is allowed
// to override. Field names stay camelCase to match this API's convention;
// OpenAiService maps each one to OpenAI's actual (snake_case) param name.
export class AgentConfigurationDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  topP?: number;

  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  frequencyPenalty?: number;

  @IsOptional()
  @IsNumber()
  @Min(-2)
  @Max(2)
  presencePenalty?: number;
}
