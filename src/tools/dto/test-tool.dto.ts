import { IsObject, IsOptional } from 'class-validator';

export class TestToolDto {
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}
