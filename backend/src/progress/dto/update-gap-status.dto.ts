import { IsEnum } from 'class-validator';
import { GapStatus } from '@prisma/client';

export class UpdateGapStatusDto {
  @IsEnum(GapStatus)
  status: GapStatus;
}
