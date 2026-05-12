import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class EvaluateLegalReadinessDto {
  @ApiProperty({ example: 'UA' })
  @IsString()
  @MinLength(2)
  @MaxLength(3)
  sourceCountry!: string;

  @ApiProperty({ example: 'DE' })
  @IsString()
  @MinLength(2)
  @MaxLength(3)
  targetCountry!: string;

  @ApiPropertyOptional({ example: 'Berlin' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetCity?: string;

  @ApiPropertyOptional({ example: 'DevOps Engineer' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  desiredRole?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasExistingWorkAuthorization?: boolean;

  @ApiPropertyOptional({ example: true })
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

  @ApiPropertyOptional({ example: 56000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  targetSalaryGrossAnnual?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  relocationWithFamily?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hasFamilyDocumentsPrepared?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasCheckedDependentResidenceRules?: boolean;
}
