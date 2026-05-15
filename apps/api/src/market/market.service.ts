import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ManualAdapter } from './adapters/manual.adapter.js';
import { ImportMarketDto } from './dto/import-market.dto.js';
import { ImportJobPostingsDto } from './dto/import-job-postings.dto.js';
import { MarketDigestService } from './market-digest.service.js';

@Injectable()
export class MarketService {
  private readonly manualAdapter = new ManualAdapter();

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketDigestService: MarketDigestService,
  ) {}

  async importManual(dto: ImportMarketDto) {
    const rows = this.manualAdapter.parse(dto.skills);

    const resolvedSkills: {
      skillId: string;
      frequency: number;
      avgRequiredLevel: number;
    }[] = [];

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

    await this.marketDigestService.recomputeCountryDigest(
      snapshot.country.toUpperCase(),
    );

    return snapshot;
  }

  async importJobPostings(dto: ImportJobPostingsDto) {
    const competencyMap = new Map(
      (
        await this.prisma.competency.findMany({
          select: { id: true, name: true },
        })
      ).map((x) => [x.name.toLowerCase(), x.id]),
    );

    let inserted = 0;
    let updated = 0;
    const affectedCountries = new Set<string>();

    for (const item of dto.items) {
      const requirements = (item.requirements ?? [])
        .map((x) => x.trim())
        .filter(Boolean);
      const requirementCompetencyIds = requirements
        .map((name) => competencyMap.get(name.toLowerCase()))
        .filter((x): x is string => Boolean(x));

      const dedupKey = this.buildDedupKey(item);
      const jobPostingModel = this.getJobPostingModel();
      const existing = await jobPostingModel.findUnique({
        where: { dedupKey },
      });

      const payload = {
        countryCode: item.countryCode.toUpperCase(),
        roleName: item.roleName,
        title: item.title,
        company: item.company,
        location: item.location,
        source: item.source,
        sourceUrl: item.sourceUrl ?? null,
        sourceExternalId: item.sourceExternalId ?? null,
        salaryMinUsd: item.salaryMinUsd ?? null,
        salaryMaxUsd: item.salaryMaxUsd ?? null,
        salaryCurrency: item.salaryCurrency ?? null,
        requirements,
        requirementCompetencyIds,
        dedupKey,
      };
      affectedCountries.add(payload.countryCode);

      if (existing) {
        await jobPostingModel.update({
          where: { id: existing.id },
          data: payload,
        });
        updated += 1;
      } else {
        await jobPostingModel.create({ data: payload });
        inserted += 1;
      }
    }

    await this.marketDigestService.recomputeMany(
      Array.from(affectedCountries.values()),
    );

    return {
      inserted,
      updated,
      deduplication:
        'dedupKey = source+externalId or normalized sourceUrl or normalized title+company+location+role+country',
    };
  }

  private buildDedupKey(item: {
    source: string;
    sourceExternalId?: string;
    sourceUrl?: string;
    title: string;
    company: string;
    location: string;
    roleName: string;
    countryCode: string;
  }) {
    const normalize = (value: string) =>
      value.trim().toLowerCase().replace(/\s+/g, ' ');
    const source = normalize(item.source);
    if (item.sourceExternalId?.trim()) {
      return `${source}|ext:${normalize(item.sourceExternalId)}`;
    }
    if (item.sourceUrl?.trim()) {
      return `${source}|url:${normalize(item.sourceUrl)}`;
    }
    return `${source}|${normalize(item.title)}|${normalize(item.company)}|${normalize(item.location)}|${normalize(item.roleName)}|${normalize(item.countryCode)}`;
  }

  private getJobPostingModel() {
    const model = (this.prisma as any).jobPosting;
    if (!model) {
      throw new InternalServerErrorException(
        'Prisma client is stale: JobPosting model is missing. Run "npx prisma generate" and restart backend process.',
      );
    }
    return model;
  }
}
