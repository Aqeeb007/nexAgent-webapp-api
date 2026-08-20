import { IsUUID } from 'class-validator';

export class AttachToolDto {
  @IsUUID()
  toolId!: string;
}
