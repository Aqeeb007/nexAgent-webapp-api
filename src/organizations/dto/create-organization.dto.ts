import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class CreateOrganizationDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;
}
