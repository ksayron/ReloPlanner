import { IsString, MaxLength } from 'class-validator';

export class PostCaseMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;
}
