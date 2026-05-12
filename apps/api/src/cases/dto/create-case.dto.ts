import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCaseDto {
  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
