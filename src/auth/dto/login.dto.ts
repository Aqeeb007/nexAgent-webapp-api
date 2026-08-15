import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class LoginDto {
  @Trim()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Not trimmed: leading/trailing spaces may be intentional as part of the secret.
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only hashes the first 72 bytes
  password!: string;
}
