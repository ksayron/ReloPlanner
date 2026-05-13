import { IsIn, IsOptional, IsString } from 'class-validator';
import type { ForcedCheckoutOutcome } from '../payment-provider.interface.js';

const FORCED_OUTCOMES: ForcedCheckoutOutcome[] = [
  'SUCCESS',
  'FAIL_CARD_DECLINED',
  'FAIL_PROVIDER_ERROR',
  'CANCELED',
];

export class ResolveCheckoutDto {
  @IsOptional()
  @IsString()
  @IsIn(FORCED_OUTCOMES)
  forcedOutcome?: ForcedCheckoutOutcome;
}
