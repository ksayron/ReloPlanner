import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSpecialistUserDto {
  @ApiProperty({ example: 'specialist@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'Case Specialist',
    minLength: 2,
    maxLength: 60,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  displayName: string;

  @ApiProperty({
    example: 'S3cureP@ss!',
    minLength: 8,
    description:
      'At least 8 chars with uppercase, lowercase, digit, and special symbol',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/, {
    message:
      'Password must include uppercase, lowercase, number, and special character',
  })
  password: string;
}
