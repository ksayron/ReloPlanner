import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ManualAdapter } from './adapters/manual.adapter.js';
import { ImportMarketDto } from './dto/import-market.dto.js';

@Injectable()
export class MarketService {
  private readonly manualAdapter = new ManualAdapter();

  constructor(private readonly prisma: PrismaService) {}

  async importManual(dto: ImportMarketDto) {
    const rows = this.manualAdapter.parse(dto.skills);

    const resolvedSkills: { skillId: string; frequency: number; avgRequiredLevel: number }[] = [];

    for (const row of rows) {
      let skill = await this.prisma.skill.findFirst({
        where: { name: row.skillName },
      });

      if (!skill) {
        const alias = await this.prisma.skillAlias.findFirst({
          where: { alias: row.skillName },
          include: { skill: true },
        });
        if (alias) {
          skill = alias.skill;
        }
      }

      if (skill) {
        resolvedSkills.push({
          skillId: skill.id,
          frequency: row.frequency,
          avgRequiredLevel: row.avgRequiredLevel,
        });
      }
    }

    const snapshot = await this.prisma.marketSnapshot.create({
      data: {
        snapshotDate: new Date(),
        source: 'manual',
        country: dto.country,
        city: dto.city,
        totalVacancies: dto.totalVacancies,
        skillDemands: {
          create: resolvedSkills.map((s) => ({
            skillId: s.skillId,
            frequency: s.frequency,
            avgRequiredLevel: s.avgRequiredLevel,
          })),
        },
      },
      include: {
        skillDemands: true,
      },
    });

    return snapshot;
  }
}
