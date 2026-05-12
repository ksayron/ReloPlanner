import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateUserBlockStatusDto {
  @ApiProperty({
    example: true,
    description: 'When true the user account is blocked from auth and API access',
  })
  @IsBoolean()
  blocked: boolean;
}
