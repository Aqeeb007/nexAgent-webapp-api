import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

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
  @IsObject()
  configuration?: Record<string, unknown>;
}
