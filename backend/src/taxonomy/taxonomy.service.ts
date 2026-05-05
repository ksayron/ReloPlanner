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

  findAllCompetencies() {
    return this.prisma.competency.findMany({
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findRelevantCompetencies(roleName?: string, countryCode?: string) {
    const normalizedRole = roleName?.trim();
    const normalizedCountry = countryCode?.trim().toUpperCase();

    if (!normalizedRole || !normalizedCountry) {
      return this.findAllCompetencies();
    }

    const requirements = await this.prisma.marketRequirement.findMany({
      where: {
        roleName: normalizedRole,
        countryCode: normalizedCountry,
        isActive: true,
      },
      orderBy: [
        { priority: 'asc' },
        { roleRelevance: 'asc' },
        { frequency: 'desc' },
        { importance: 'desc' },
      ],
      include: { competency: true },
    });

    if (requirements.length === 0) {
      return this.findAllCompetencies();
    }

    const seen = new Set<string>();
    const relevantCompetencies = [];
    for (const req of requirements) {
      if (!seen.has(req.competencyId)) {
        seen.add(req.competencyId);
        relevantCompetencies.push(req.competency);
      }
    }

    return relevantCompetencies;
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
