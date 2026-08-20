import {
  IsIn,
  IsNotEmpty,
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
}
