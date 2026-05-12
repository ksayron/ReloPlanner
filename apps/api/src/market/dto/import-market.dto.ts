import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class MarketSkillRow {
  @ApiProperty({ example: 'Kubernetes' })
  @IsString()
  skillName: string;

  @ApiProperty({ example: 0.42 })
  frequency: number;

  @ApiProperty({ example: 0.75 })
  avgRequiredLevel: number;
}

export class ImportMarketDto {
  @ApiProperty({ example: 'DE' })
  @IsString()
  country: string;

  @ApiPropertyOptional({ example: 'Berlin' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: 8300 })
  @IsInt()
  totalVacancies: number;

  @ApiProperty({
    type: () => MarketSkillRow,
    isArray: true,
    example: [
      { skillName: 'Kubernetes', frequency: 0.42, avgRequiredLevel: 0.75 },
      { skillName: 'Docker', frequency: 0.51, avgRequiredLevel: 0.72 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketSkillRow)
  skills: MarketSkillRow[];
}
