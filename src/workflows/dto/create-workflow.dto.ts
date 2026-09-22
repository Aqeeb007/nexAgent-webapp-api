import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { Trim } from '../../common/decorators/trim.decorator';

export class CreateWorkflowDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
