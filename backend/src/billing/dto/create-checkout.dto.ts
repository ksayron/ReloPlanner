import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @IsIn(['PREMIUM'])
  planCode!: 'PREMIUM';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  successUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  cancelUrl?: string;
}

