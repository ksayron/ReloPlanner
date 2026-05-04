import { IsString, IsOptional, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class MarketSkillRow {
  @IsString()
  skillName: string;

  frequency: number;
  avgRequiredLevel: number;
}

export class ImportMarketDto {
  @IsString()
  country: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsInt()
  totalVacancies: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarketSkillRow)
  skills: MarketSkillRow[];
}
