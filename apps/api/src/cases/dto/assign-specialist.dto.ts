import { IsUUID } from 'class-validator';

export class AssignSpecialistDto {
  @IsUUID()
  specialistUserId!: string;
}
