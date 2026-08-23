import { IsUUID } from 'class-validator';

export class JoinConversationDto {
  @IsUUID()
  agentId!: string;

  @IsUUID()
  conversationId!: string;
}
