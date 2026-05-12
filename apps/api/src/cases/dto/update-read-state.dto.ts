import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateReadStateDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  lastReadMessageId?: string;
}
