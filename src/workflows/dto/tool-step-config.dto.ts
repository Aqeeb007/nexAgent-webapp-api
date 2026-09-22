import { IsObject, IsOptional, IsUUID } from 'class-validator';

export class ToolStepConfigDto {
  @IsUUID()
  toolId!: string;

  // Static args, mostly — any string value equal to the literal
  // "{{input}}" is resolved to the current pipeline input before the tool
  // call (see execution/template.util.ts).
  @IsOptional()
  @IsObject()
  args?: Record<string, unknown>;
}
