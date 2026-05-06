import { IsString, IsOptional, IsEnum } from 'class-validator';
import { SkillCategory } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSkillDto {
  @ApiProperty({ example: 'Kubernetes' })
  @IsString()
  name: string;

  @ApiProperty({ enum: SkillCategory, example: SkillCategory.HARD_SKILL })
  @IsEnum(SkillCategory)
  category: SkillCategory;

  @ApiPropertyOptional({ example: '0d4b579a-4d29-4294-9f10-c048627f4cd0' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
