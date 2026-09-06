import { IsUUID } from 'class-validator';

export class AttachDocumentDto {
  @IsUUID()
  documentId!: string;
}
