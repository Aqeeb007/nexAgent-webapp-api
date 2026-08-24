import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CustomJsToolConfigDto {
  // Wrapped at execution time as `(async () => { <code> })()` inside a
  // worker's vm context — the tool author must `return` a JSON-serializable
  // value. See CustomJsToolExecutor for the sandboxing contract.
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  code!: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(30_000)
  timeoutMs?: number;
}
