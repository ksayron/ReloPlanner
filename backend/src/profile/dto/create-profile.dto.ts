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
import {
  HardSkillLevel,
  LanguageLevel,
  CertificationStatus,
} from '@prisma/client';

export class CompetencyInput {
  @IsString()
  competencyId: string;

  @IsOptional()
  @IsEnum(HardSkillLevel)
  hardSkillLevel?: HardSkillLevel;

  @IsOptional()
  @IsEnum(LanguageLevel)
  languageLevel?: LanguageLevel;

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
  @Type(() => CompetencyInput)
  competencies: CompetencyInput[];
}
