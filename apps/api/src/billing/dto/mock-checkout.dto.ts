import { IsString, MinLength } from 'class-validator';

export class MockCheckoutDto {
  @IsString()
  @MinLength(8)
  checkoutSessionId!: string;
}
