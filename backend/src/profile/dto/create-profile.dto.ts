import { IsString, IsOptional, IsInt, IsArray, ValidateNested, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class SkillInput {
  @IsString()
  skillId: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  proficiency: number;
}

export class CreateProfileDto {
  @IsString()
  targetCountry: string;

  @IsOptional()
  @IsString()
  targetCity?: string;

  @IsString()
  currentCountry: string;

  @IsInt()
  yearsExperience: number;

  @IsString()
  desiredRole: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SkillInput)
  skills: SkillInput[];
}
