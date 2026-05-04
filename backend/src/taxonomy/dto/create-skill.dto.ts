import { IsString, IsOptional, IsEnum } from 'class-validator';
import { SkillCategory } from '@prisma/client';

export class CreateSkillDto {
  @IsString()
  name: string;

  @IsEnum(SkillCategory)
  category: SkillCategory;

  @IsOptional()
  @IsString()
  parentId?: string;
}
