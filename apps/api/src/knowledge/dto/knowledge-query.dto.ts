import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from '../knowledge.types.js';

export class KnowledgeQueryDto {
  @ApiPropertyOptional({
    example: 'PL',
    description: 'Optional country code filter (ISO-like uppercase code).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  @Matches(/^[A-Za-z_-]+$/)
  country?: string;

  @ApiPropertyOptional({
    enum: KNOWLEDGE_CATEGORIES,
    example: 'VISA',
  })
  @IsOptional()
  @IsIn(KNOWLEDGE_CATEGORIES)
  category?: KnowledgeCategory;

  @ApiPropertyOptional({
    example: 'en',
    description: 'Optional language code. Defaults to en.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^[A-Za-z-]+$/)
  language?: string;
}
