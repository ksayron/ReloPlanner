import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthCompleteEmailDto {
  @ApiProperty({ example: '1MiuDMEYq1Pjz0hpc4Y_mTvKxw5W5TIlh8xco2g6FvA' })
  @IsString()
  @MinLength(16)
  ticket: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;
}
