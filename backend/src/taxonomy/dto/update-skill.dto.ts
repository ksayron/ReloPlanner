import { IsString, IsOptional, IsEnum } from 'class-validator';
import { SkillCategory } from '@prisma/client';

export class UpdateSkillDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(SkillCategory)
  category?: SkillCategory;

  @IsOptional()
  @IsString()
  parentId?: string;
}
