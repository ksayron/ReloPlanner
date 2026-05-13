import { IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTransferabilityDto {
  @ApiProperty({ example: 'e8f04618-7d20-46eb-abbb-fc6b3683ca7f' })
  @IsString()
  sourceSkillId: string;

  @ApiProperty({ example: '95f9050f-38cd-4518-8ca5-b1cf764f8955' })
  @IsString()
  targetSkillId: string;

  @ApiProperty({ example: 0.5, minimum: 0, maximum: 1 })
  @IsNumber()
  @Min(0)
  @Max(1)
  coefficient: number;
}
