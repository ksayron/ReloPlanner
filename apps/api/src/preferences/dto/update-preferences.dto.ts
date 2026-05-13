import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    example: 'en',
    description: 'Preferred UI language: en or ru.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  preferredLanguage?: string;

  @ApiPropertyOptional({
    example: 'light',
    description: 'Preferred theme: light or dark.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  preferredTheme?: string;

  @ApiPropertyOptional({
    example: 'USD',
    description: 'Preferred currency code.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  preferredCurrency?: string;

  @ApiPropertyOptional({
    example: 'DE',
    nullable: true,
    description: 'Default target country code from the target-country catalog.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  defaultTargetCountry?: string | null;

  @ApiPropertyOptional({
    example: 'Berlin',
    nullable: true,
    description:
      'Default target city. Can be one of suggested cities or a custom non-empty value.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  defaultTargetCity?: string | null;

  @ApiPropertyOptional({
    example: 8,
    description: 'Weekly study hours budget (1..40).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyStudyHours?: number;

  @ApiPropertyOptional({
    example: 'en',
    description: 'Preferred report locale: en or ru.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  preferredReportLanguage?: string;
}
