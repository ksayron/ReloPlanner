import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { CreateTransferabilityDto } from './dto/create-transferability.dto';

@Injectable()
export class TaxonomyService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.skill.findMany({
      include: {
        aliases: true,
        children: true,
        transfersFrom: {
          include: { targetSkill: true },
        },
      },
    });
  }

  create(dto: CreateSkillDto) {
    return this.prisma.skill.create({ data: dto });
  }

  update(id: string, dto: UpdateSkillDto) {
    return this.prisma.skill.update({ where: { id }, data: dto });
  }

  upsertTransferability(dto: CreateTransferabilityDto) {
    return this.prisma.skillTransferability.upsert({
      where: {
        sourceSkillId_targetSkillId: {
          sourceSkillId: dto.sourceSkillId,
          targetSkillId: dto.targetSkillId,
        },
      },
      update: { coefficient: dto.coefficient },
      create: dto,
    });
  }
}
