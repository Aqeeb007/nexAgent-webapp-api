import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { Trim } from '../../common/decorators/trim.decorator';
import { HttpToolConfigDto } from './http-tool-config.dto';

export class CreateToolDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsIn(['http'])
  type!: 'http';

  @ValidateNested()
  @Type(() => HttpToolConfigDto)
  config!: HttpToolConfigDto;

  // What the LLM sees when deciding whether/how to call this tool. Required
  // for new tools — Phase 3 predates chat, so existing rows may lack one.
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description!: string;

  // A JSON Schema object describing the tool's arguments (e.g.
  // { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }).
  // Not deeply validated as JSON Schema for MVP — a malformed schema just
  // produces a confused model, not a security issue.
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}
