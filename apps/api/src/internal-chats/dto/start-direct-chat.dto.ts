import { IsOptional, IsUUID } from 'class-validator';

export class StartDirectChatDto {
  @IsUUID()
  clientUserId!: string;

  @IsOptional()
  @IsUUID()
  specialistUserId?: string;
}
