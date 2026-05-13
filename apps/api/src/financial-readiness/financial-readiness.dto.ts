import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const CURRENCY_CODES = ['USD', 'EUR', 'GBP', 'CAD', 'PLN', 'UAH'] as const;
type CurrencyCodeValue = (typeof CURRENCY_CODES)[number];
const LIFESTYLE_PROFILES = ['FRUGAL', 'STANDARD', 'COMFORTABLE'] as const;
type LifestyleProfileValue = (typeof LIFESTYLE_PROFILES)[number];

export class EvaluateFinancialReadinessDto {
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

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  savingsAmount?: number;

  @ApiPropertyOptional({ enum: CURRENCY_CODES, example: 'USD' })
  @IsOptional()
  @IsEnum(CURRENCY_CODES)
  savingsCurrency?: CurrencyCodeValue;

  @ApiPropertyOptional({ example: 1800 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyBudgetAmount?: number;

  @ApiPropertyOptional({ enum: CURRENCY_CODES, example: 'EUR' })
  @IsOptional()
  @IsEnum(CURRENCY_CODES)
  monthlyBudgetCurrency?: CurrencyCodeValue;

  @ApiPropertyOptional({ example: 4200 })
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
}
