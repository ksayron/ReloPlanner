import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ScoringService } from './scoring.service.js';

@Injectable()
export class JobMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async listPostingsForProfile(profileId: string, userId: string, limitRaw?: string) {
    const profile = await this.requireProfile(profileId, userId);
    const parsedLimit = Number(limitRaw ?? 20);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.trunc(parsedLimit))) : 20;

    const jobPostingModel = this.getJobPostingModel();
    const postings = await this.fetchCandidatePostings(jobPostingModel, profile, limit);

    return {
      items: postings.map((posting: any) => this.toPostingResponse(posting)),
      limit,
    };
  }

  async matchPosting(profileId: string, postingId: string, userId: string) {
    const profile = await this.requireProfile(profileId, userId);
    const jobPostingModel = this.getJobPostingModel();
    const posting = await jobPostingModel.findUnique({
      where: { id: postingId },
    });
    if (!posting) throw new NotFoundException('Job posting not found');

    const requirements = await this.loadRequirements(posting);
    const userCompetencies = profile.competencies.map((x: any) => ({
      competencyId: x.competencyId,
      competencyType: x.competency.type as any,
      hardSkillLevel: x.hardSkillLevel as any,
      languageLevel: x.languageLevel as any,
      certificationStatus: x.certificationStatus as any,
    }));

    const computed = this.scoring.computeAnalysis({
      requirements,
      userCompetencies,
      transferEdges: [],
      countryLanguageRelevance: new Map<string, string>(),
      effortProfiles: new Map<string, Map<string, number>>(),
      weeklyHours: 8,
    });

    const topMatched = computed.analysisItems
      .filter((x) => x.matchScore >= 1)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((x) => x.competency.name);

    const missingSkills = computed.analysisItems
      .filter((x) => x.recommendationType === 'ACTIONABLE_GAP')
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6)
      .map((x) => x.competency.name);

    return {
      posting: this.toPostingResponse(posting),
      score: computed.fitScore,
      matchedSkills: topMatched,
      missingSkills,
      rationale: this.buildRationale(computed.fitScore, topMatched.length, missingSkills.length),
    };
  }

  async getTopMatches(profileId: string, userId: string, limitRaw?: string) {
    const profile = await this.requireProfile(profileId, userId);
    const parsedLimit = Number(limitRaw ?? 3);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(10, Math.trunc(parsedLimit))) : 3;

    const jobPostingModel = this.getJobPostingModel();
    const postings = await this.fetchCandidatePostings(jobPostingModel, profile, 60);

    const scored = await Promise.all(
      postings.map(async (posting: any) => this.matchPosting(profileId, posting.id, userId)),
    );

    return {
      items: scored.sort((a, b) => b.score - a.score).slice(0, limit),
      limit,
    };
  }

  private async requireProfile(profileId: string, userId: string) {
    const profile = await this.prisma.relocationProfile.findFirst({
      where: { id: profileId, userId },
      include: { competencies: { include: { competency: true } } },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  private async loadRequirements(posting: any) {
    const requirementIds = Array.isArray(posting.requirementCompetencyIds)
      ? posting.requirementCompetencyIds.filter((x: unknown) => typeof x === 'string')
      : [];

    const competencies = await this.prisma.competency.findMany({
      where: { id: { in: requirementIds } },
    });

    return competencies.map((c) => ({
      id: `posting:${posting.id}:${c.id}`,
      competencyId: c.id,
      competencyName: c.name,
      competencyType: c.type as any,
      competencyFamily: c.family,
      priority: 'IMPORTANT' as const,
      roleRelevance: 'CORE' as const,
      frequency: 1,
      importance: 1,
      hardSkillRequiredLevel: 'PRACTICAL' as const,
      languageRequiredLevel: c.type === 'LANGUAGE' ? 'B1' as const : null,
      certificationRequirementLevel: c.type === 'CERTIFICATION' ? 'PREFERRED' as const : null,
      requiredCertificationStatus: c.type === 'CERTIFICATION' ? 'OBTAINED' as const : null,
      languageContext: c.type === 'LANGUAGE' ? 'JOB_MARKET' as const : null,
    }));
  }

  private toPostingResponse(posting: any) {
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
      requirements: Array.isArray(posting.requirements) ? posting.requirements : [],
      createdAt: posting.createdAt,
    };
  }

  private buildRationale(score: number, matchedCount: number, missingCount: number) {
    const pct = Math.round(score * 100);
    if (pct >= 80) {
      return `Strong match (${pct}%). Most key requirements are already covered (${matchedCount} matched, ${missingCount} gaps).`;
    }
    if (pct >= 60) {
      return `Moderate match (${pct}%). You are close, but several requirements still need work (${missingCount} notable gaps).`;
    }
    return `Low-to-moderate match (${pct}%). This vacancy needs significant upskilling before it becomes realistic.`;
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

  private async fetchCandidatePostings(
    jobPostingModel: any,
    profile: { targetCountry: string; desiredRole: string },
    take: number,
  ) {
    const exact = await jobPostingModel.findMany({
      where: {
        countryCode: profile.targetCountry,
        roleName: profile.desiredRole,
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
    if (exact.length > 0) return exact;

    const sameCountry = await jobPostingModel.findMany({
      where: { countryCode: profile.targetCountry },
      orderBy: { createdAt: 'desc' },
      take,
    });
    if (sameCountry.length > 0) return sameCountry;

    return jobPostingModel.findMany({
      where: { roleName: profile.desiredRole },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
