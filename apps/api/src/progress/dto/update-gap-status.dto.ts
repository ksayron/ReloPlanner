import { IsEnum } from 'class-validator';
import { GapStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateGapStatusDto {
  @ApiProperty({ enum: GapStatus, example: GapStatus.IN_PROGRESS })
  @IsEnum(GapStatus)
  status: GapStatus;
}
