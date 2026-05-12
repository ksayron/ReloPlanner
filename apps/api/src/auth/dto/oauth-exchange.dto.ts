import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthExchangeDto {
  @ApiProperty({ example: 'o9JqfQjYx8Gqf-2t8yqkP0V9dQ1k8J7fFv6J2kL0w2Q' })
  @IsString()
  @MinLength(16)
  code: string;
}
