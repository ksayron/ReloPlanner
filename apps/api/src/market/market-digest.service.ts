import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import type {
  CountryJobPostingsResponse,
  JobPosting,
  MarketDigestCountryResponse,
  MarketDigestRoleCount,
  MarketDigestSkillDemand,
} from '@reloplanner/shared-contracts';
import { TARGET_COUNTRY_CODES } from '../countries/countries.data.js';
import { PrismaService } from '../prisma/prisma.service.js';

type MarketDigestRow = {
  countryCode: string;
  snapshotDate: Date | null;
  snapshotSource: string | null;
  totalVacancies: number | null;
  roles: unknown;
  topSkills: unknown;
  computedAt: Date;
};

@Injectable()
export class MarketDigestService {
  constructor(private readonly prisma: PrismaService) {}

  async recomputeCountryDigest(countryCodeRaw: string) {
    const countryCode = (countryCodeRaw ?? '').trim().toUpperCase();
    if (!countryCode) {
      throw new BadRequestException('countryCode is required');
    }

    const snapshot = await this.prisma.marketSnapshot.findFirst({
      where: { country: countryCode },
      orderBy: [{ snapshotDate: 'desc' }, { id: 'desc' }],
      include: {
        skillDemands: {
          include: {
            skill: {
              select: { name: true },
            },
          },
        },
      },
    });

    const roleRows = await this.getJobPostingModel().groupBy({
      by: ['roleName'],
      where: { countryCode },
      _count: { _all: true },
    });
    const postings = await this.getJobPostingModel().findMany({
      where: { countryCode },
      select: { requirements: true },
    });

    const sampleRoles: MarketDigestRoleCount[] = roleRows
      .map((row: any) => ({
        roleName: row.roleName,
        vacancies: Number(row?._count?._all ?? 0),
      }))
      .sort((a: MarketDigestRoleCount, b: MarketDigestRoleCount) =>
        b.vacancies === a.vacancies
          ? a.roleName.localeCompare(b.roleName)
          : b.vacancies - a.vacancies,
      );

    const totalVacancies = snapshot?.totalVacancies ?? null;
    const postingsSampleSize = sampleRoles.reduce(
      (acc, row) => acc + row.vacancies,
      0,
    );
    const roles: MarketDigestRoleCount[] = sampleRoles.map((row) => {
      if (totalVacancies == null || postingsSampleSize <= 0) {
        return row;
      }
      const share = row.vacancies / postingsSampleSize;
      return {
        roleName: row.roleName,
        vacancies: Math.max(0, Math.round(share * totalVacancies)),
      };
    });

    const topSkills = this.buildTopSkills({
      snapshotSkills: snapshot?.skillDemands ?? [],
      postings: postings.map((item: any) => item.requirements),
      postingsSampleSize,
      totalVacancies,
    });

    const digestRow = await this.getMarketDigestModel().upsert({
      where: { countryCode },
      update: {
        snapshotDate: snapshot?.snapshotDate ?? null,
        snapshotSource: snapshot?.source ?? null,
        totalVacancies,
        postingsSampleSize,
        roles,
        topSkills,
        computedAt: new Date(),
      },
      create: {
        countryCode,
        snapshotDate: snapshot?.snapshotDate ?? null,
        snapshotSource: snapshot?.source ?? null,
        totalVacancies,
        postingsSampleSize,
        roles,
        topSkills,
        computedAt: new Date(),
      },
    });

    return this.toResponse(digestRow as MarketDigestRow);
  }

  async recomputeMany(countryCodes: string[]) {
    const normalized = Array.from(
      new Set(
        (countryCodes ?? [])
          .map((countryCode) => (countryCode ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    );
    for (const countryCode of normalized) {
      await this.recomputeCountryDigest(countryCode);
    }
  }

  async getCountryDigest(countryCodeRaw: string) {
    const countryCode = (countryCodeRaw ?? '').trim().toUpperCase();
    if (!countryCode) {
      throw new BadRequestException('country is required');
    }
    if (!TARGET_COUNTRY_CODES.includes(countryCode)) {
      throw new BadRequestException(
        `country must be one of: ${TARGET_COUNTRY_CODES.join(', ')}`,
      );
    }

    const row = (await this.getMarketDigestModel().findUnique({
      where: { countryCode },
    })) as MarketDigestRow | null;

    if (!row) {
      return this.emptyResponse(countryCode);
    }

    return this.toResponse(row);
  }

  async getCountryPostings(
    countryCodeRaw: string,
    pageRaw?: string,
    pageSizeRaw?: string,
  ): Promise<CountryJobPostingsResponse> {
    const countryCode = (countryCodeRaw ?? '').trim().toUpperCase();
    if (!countryCode) {
      throw new BadRequestException('country is required');
    }
    if (!TARGET_COUNTRY_CODES.includes(countryCode)) {
      throw new BadRequestException(
        `country must be one of: ${TARGET_COUNTRY_CODES.join(', ')}`,
      );
    }

    const parsedPage = Number(pageRaw ?? 1);
    const page = Number.isFinite(parsedPage)
      ? Math.max(1, Math.trunc(parsedPage))
      : 1;
    const parsedPageSize = Number(pageSizeRaw ?? 6);
    const pageSize = Number.isFinite(parsedPageSize)
      ? Math.max(1, Math.min(30, Math.trunc(parsedPageSize)))
      : 6;

    const jobPostingModel = this.getJobPostingModel();
    const total = await jobPostingModel.count({
      where: { countryCode },
    });
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;
    const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;
    const skip = (safePage - 1) * pageSize;

    const rows = await jobPostingModel.findMany({
      where: { countryCode },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: pageSize,
    });

    return {
      countryCode,
      page: safePage,
      pageSize,
      total,
      totalPages,
      items: rows.map((row: any) => this.toPostingResponse(row)),
    };
  }

  private toResponse(row: MarketDigestRow): MarketDigestCountryResponse {
    const roles = this.normalizeRoles(row.roles);
    const topSkills = this.normalizeTopSkills(row.topSkills);
    const hasData =
      row.snapshotDate != null ||
      row.totalVacancies != null ||
      roles.length > 0 ||
      topSkills.length > 0;

    return {
      countryCode: row.countryCode,
      hasData,
      snapshotDate: row.snapshotDate ? row.snapshotDate.toISOString() : null,
      snapshotSource: row.snapshotSource ?? null,
      totalVacancies: row.totalVacancies ?? null,
      postingsSampleSize: Number((row as any).postingsSampleSize ?? 0),
      roles,
      topSkills,
      computedAt: row.computedAt.toISOString(),
    };
  }

  private emptyResponse(countryCode: string): MarketDigestCountryResponse {
    return {
      countryCode,
      hasData: false,
      snapshotDate: null,
      snapshotSource: null,
      totalVacancies: null,
      postingsSampleSize: 0,
      roles: [],
      topSkills: [],
      computedAt: null,
    };
  }

  private normalizeRoles(value: unknown): MarketDigestRoleCount[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        const row = item as Record<string, unknown>;
        const roleName = String(row.roleName ?? '').trim();
        const vacancies = Number(row.vacancies ?? 0);
        if (!roleName || !Number.isFinite(vacancies) || vacancies < 0) {
          return null;
        }
        return { roleName, vacancies: Math.trunc(vacancies) };
      })
      .filter((item): item is MarketDigestRoleCount => Boolean(item));
  }

  private normalizeTopSkills(value: unknown): MarketDigestSkillDemand[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        const row = item as Record<string, unknown>;
        const skillName = String(row.skillName ?? '').trim();
        const frequency = Number(row.frequency ?? 0);
        const count = Number(row.count ?? 0);
        if (
          !skillName ||
          !Number.isFinite(frequency) ||
          frequency < 0 ||
          !Number.isFinite(count) ||
          count < 0
        ) {
          return null;
        }
        return {
          skillName,
          frequency,
          count: Math.trunc(count),
        };
      })
      .filter((item): item is MarketDigestSkillDemand => Boolean(item));
  }

  private buildTopSkills(params: {
    snapshotSkills: any[];
    postings: unknown[];
    postingsSampleSize: number;
    totalVacancies: number | null;
  }): MarketDigestSkillDemand[] {
    const sampleSkillCounts = new Map<string, number>();
    for (const rawRequirements of params.postings) {
      if (!Array.isArray(rawRequirements)) continue;
      for (const rawSkill of rawRequirements) {
        const skillName = String(rawSkill ?? '').trim();
        if (!skillName) continue;
        sampleSkillCounts.set(
          skillName,
          (sampleSkillCounts.get(skillName) ?? 0) + 1,
        );
      }
    }

    if (params.postingsSampleSize > 0 && sampleSkillCounts.size > 0) {
      return Array.from(sampleSkillCounts.entries())
        .map(([skillName, sampleCount]) => {
          const frequency = sampleCount / params.postingsSampleSize;
          const count =
            params.totalVacancies == null
              ? sampleCount
              : Math.max(0, Math.round(frequency * params.totalVacancies));
          return {
            skillName,
            frequency: Math.round(frequency * 10000) / 10000,
            count,
          };
        })
        .sort((a, b) =>
          b.frequency === a.frequency
            ? b.count === a.count
              ? a.skillName.localeCompare(b.skillName)
              : b.count - a.count
            : b.frequency - a.frequency,
        )
        .slice(0, 10);
    }

    return params.snapshotSkills
      .map((demand: any): MarketDigestSkillDemand => {
        const frequency = Number(demand.frequency ?? 0);
        const count =
          params.totalVacancies == null
            ? 0
            : Math.max(0, Math.round(frequency * params.totalVacancies));
        return {
          skillName: String(demand?.skill?.name ?? 'Unknown skill'),
          frequency,
          count,
        };
      })
      .sort((a, b) =>
        b.frequency === a.frequency
          ? b.count === a.count
            ? a.skillName.localeCompare(b.skillName)
            : b.count - a.count
          : b.frequency - a.frequency,
      )
      .slice(0, 10);
  }

  private toPostingResponse(posting: any): JobPosting {
    return {
      id: posting.id,
      countryCode: posting.countryCode,
      roleName: posting.roleName,
      title: posting.title,
      company: posting.company,
      location: posting.location,
      source: posting.source,
      sourceUrl: posting.sourceUrl,
      salaryMinUsd: posting.salaryMinUsd,
      salaryMaxUsd: posting.salaryMaxUsd,
      salaryCurrency: posting.salaryCurrency,
      requirements: Array.isArray(posting.requirements)
        ? posting.requirements
        : [],
      createdAt:
        posting.createdAt instanceof Date
          ? posting.createdAt.toISOString()
          : String(posting.createdAt),
    };
  }

  private getMarketDigestModel() {
    const model = (this.prisma as any).marketDigest;
    if (!model) {
      throw new InternalServerErrorException(
        'Prisma client is stale: MarketDigest model is missing. Run "npx prisma generate" and restart backend process.',
      );
    }
    return model;
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
