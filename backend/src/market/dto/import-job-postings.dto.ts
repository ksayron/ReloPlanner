import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class JobPostingImportItemDto {
  @IsString()
  countryCode!: string;

  @IsString()
  roleName!: string;

  @IsString()
  title!: string;

  @IsString()
  company!: string;

  @IsString()
  location!: string;

  @IsString()
  source!: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  sourceExternalId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMinUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salaryMaxUsd?: number;

  @IsOptional()
  @IsString()
  salaryCurrency?: string;

  @IsArray()
  @IsString({ each: true })
  requirements!: string[];
}

export class ImportJobPostingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobPostingImportItemDto)
  items!: JobPostingImportItemDto[];
}
