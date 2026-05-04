import { IsString, IsNumber, Min, Max } from 'class-validator';

export class CreateTransferabilityDto {
  @IsString()
  sourceSkillId: string;

  @IsString()
  targetSkillId: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  coefficient: number;
}
