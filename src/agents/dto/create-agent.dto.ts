import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { Trim } from '../../common/decorators/trim.decorator';
import { AgentConfigurationDto } from './agent-configuration.dto';

export class CreateAgentDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  systemPrompt!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AgentConfigurationDto)
  configuration?: AgentConfigurationDto;
}
