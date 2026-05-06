import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  IsEnum,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HardSkillLevel,
  LanguageLevel,
  CertificationStatus,
} from '@prisma/client';

export class CompetencyInput {
  @ApiProperty({
    example: '3f53f6e2-8fcb-4d82-a43f-6efd57b4e709',
    description: 'Competency id from /competencies',
  })
  @IsString()
  competencyId: string;

  @ApiPropertyOptional({ enum: HardSkillLevel, example: HardSkillLevel.PRACTICAL })
  @IsOptional()
  @IsEnum(HardSkillLevel)
  hardSkillLevel?: HardSkillLevel;

  @ApiPropertyOptional({ enum: LanguageLevel, example: LanguageLevel.B1 })
  @IsOptional()
  @IsEnum(LanguageLevel)
  languageLevel?: LanguageLevel;

  @ApiPropertyOptional({
    enum: CertificationStatus,
    example: CertificationStatus.IN_PROGRESS,
  })
  @IsOptional()
  @IsEnum(CertificationStatus)
  certificationStatus?: CertificationStatus;

  @ValidateIf(
    (o: CompetencyInput) =>
      !o.hardSkillLevel && !o.languageLevel && !o.certificationStatus,
  )
  @IsString()
  _levelRequiredForValidation?: string;
}

export class CreateProfileDto {
  @ApiProperty({ example: 'DE' })
  @IsString()
  targetCountry: string;

  @ApiPropertyOptional({ example: 'Berlin' })
  @IsOptional()
  @IsString()
  targetCity?: string;

  @ApiProperty({ example: 'UA' })
  @IsString()
  currentCountry: string;

  @ApiProperty({ example: 4, minimum: 0 })
  @IsInt()
  yearsExperience: number;

  @ApiProperty({ example: 'DevOps Engineer' })
  @IsString()
  desiredRole: string;

  @ApiProperty({
    type: () => CompetencyInput,
    isArray: true,
    example: [
      { competencyId: '3f53f6e2-8fcb-4d82-a43f-6efd57b4e709', hardSkillLevel: 'PRACTICAL' },
      { competencyId: '8c558f95-60f8-4f03-8fe8-5ab2f2f14a4a', languageLevel: 'B1' },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetencyInput)
  competencies: CompetencyInput[];
}
