import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

// Sent over the 'sendMessage' socket event — agentId/conversationId are
// re-specified per event (mirroring JoinConversationDto) rather than reused
// from the room the client already joined, so each send is self-contained
// and independently validated.
export class SendConversationMessageDto {
  @IsUUID()
  agentId!: string;

  @IsUUID()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message!: string;
}
