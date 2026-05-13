import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsUUID } from 'class-validator';

export class CreateCaseDto {
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsUUID()
  profileId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalNotes?: string;
}
