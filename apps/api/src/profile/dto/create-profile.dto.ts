import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  IsEnum,
  ValidateIf,
  IsBoolean,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HardSkillLevel,
  LanguageLevel,
  CertificationStatus,
} from '@prisma/client';

const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'PLN', 'UAH'] as const;
type CurrencyCodeValue = (typeof CURRENCY_CODES)[number];
const LIFESTYLE_PROFILES = ['FRUGAL', 'STANDARD', 'COMFORTABLE'] as const;
type LifestyleProfileValue = (typeof LIFESTYLE_PROFILES)[number];

export class CompetencyInput {
  @ApiProperty({
    example: '3f53f6e2-8fcb-4d82-a43f-6efd57b4e709',
    description: 'Competency id from /competencies',
  })
  @IsString()
  competencyId: string;

  @ApiPropertyOptional({
    enum: HardSkillLevel,
    example: HardSkillLevel.PRACTICAL,
  })
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

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  savingsAmount?: number;

  @ApiPropertyOptional({ enum: CURRENCY_CODES, example: 'USD' })
  @IsOptional()
  @IsEnum(CURRENCY_CODES)
  savingsCurrency?: CurrencyCodeValue;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyBudgetAmount?: number;

  @ApiPropertyOptional({ enum: CURRENCY_CODES, example: 'EUR' })
  @IsOptional()
  @IsEnum(CURRENCY_CODES)
  monthlyBudgetCurrency?: CurrencyCodeValue;

  @ApiPropertyOptional({ example: 4500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  expectedNetSalaryAmount?: number;

  @ApiPropertyOptional({ enum: CURRENCY_CODES, example: 'EUR' })
  @IsOptional()
  @IsEnum(CURRENCY_CODES)
  expectedNetSalaryCurrency?: CurrencyCodeValue;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  dependentsCount?: number;

  @ApiPropertyOptional({ enum: LIFESTYLE_PROFILES, example: 'STANDARD' })
  @IsOptional()
  @IsEnum(LIFESTYLE_PROFILES)
  lifestyle?: LifestyleProfileValue;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  jobSearchMonths?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasExistingWorkAuthorization?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasJobOffer?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasRecognizedDegree?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasFormalEducation?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  relocationWithFamily?: boolean;

  @ApiProperty({
    type: () => CompetencyInput,
    isArray: true,
    example: [
      {
        competencyId: '3f53f6e2-8fcb-4d82-a43f-6efd57b4e709',
        hardSkillLevel: 'PRACTICAL',
      },
      {
        competencyId: '8c558f95-60f8-4f03-8fe8-5ab2f2f14a4a',
        languageLevel: 'B1',
      },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetencyInput)
  competencies: CompetencyInput[];
}
