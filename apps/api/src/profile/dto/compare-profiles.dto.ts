import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CompareProfilesDto {
  @ApiProperty({
    example: '3f53f6e2-8fcb-4d82-a43f-6efd57b4e709',
    description: 'First profile id owned by current user',
  })
  @IsString()
  firstProfileId: string;

  @ApiProperty({
    example: '8c558f95-60f8-4f03-8fe8-5ab2f2f14a4a',
    description: 'Second profile id owned by current user',
  })
  @IsString()
  secondProfileId: string;
}
