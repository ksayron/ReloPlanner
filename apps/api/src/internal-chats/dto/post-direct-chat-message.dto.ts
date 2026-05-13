import { IsString, MaxLength } from 'class-validator';

export class PostDirectChatMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;
}
