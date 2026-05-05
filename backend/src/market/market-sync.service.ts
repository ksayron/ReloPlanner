import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { SkillNormalizerService } from './skill-normalizer.js';
import { AdzunaAdapter } from './adapters/adzuna.adapter.js';
import { ILiveMarketAdapter } from './adapters/market-data.adapter.js';

/** Default avgRequiredLevel by SkillCategory */
const REQUIRED_LEVEL: Record<string, number> = {
  HARD_SKILL: 0.70,
  LANGUAGE: 0.75,
  CERTIFICATION: 0.65,
  SOFT_SKILL: 0.60,
};

const MIN_VACANCIES_FOR_SNAPSHOT = 25;
const MIN_RESOLVED_SKILLS_FOR_SNAPSHOT = 5;

export interface SyncResult {
  country: string;
  status: 'synced' | 'skipped' | 'error';
  totalVacancies?: number;
  skillsImported?: number;
  message?: string;
}

export interface CountrySyncStatus {
  date: Date | null;
  source: string | null;
  skills: number;
  status: SyncResult['status'] | 'unknown';
  totalVacancies: number | null;
  skillsImported: number | null;
  message: string | null;
  updatedAt: Date | null;
}

@Injectable()
export class MarketSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketSyncService.name);

  private readonly adapterMap: Map<string, ILiveMarketAdapter> = new Map();
  private readonly lastSyncOutcome: Map<string, SyncResult & { updatedAt: Date }> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: SkillNormalizerService,
    private readonly adzuna: AdzunaAdapter,
  ) {
    this.adapterMap.set('DE', adzuna);
    this.adapterMap.set('NL', adzuna);
    this.adapterMap.set('CA', adzuna);
    this.adapterMap.set('GB', adzuna);
    this.adapterMap.set('PL', adzuna);
  }

  onApplicationBootstrap() {
    // Non-blocking startup sync
    this.syncAll().catch((err) =>
      this.logger.error(`Startup market sync failed: ${err.message}`),
    );
  }

  /** Runs every day at 02:00 UTC */
  @Cron('0 2 * * *')
  async scheduledSync() {
    this.logger.log('Running scheduled daily market sync...');
    await this.syncAll();
  }

  async syncAll(): Promise<SyncResult[]> {
    const countries = ['DE', 'NL', 'CA', 'GB', 'PL'];
    const results: SyncResult[] = [];

    for (const country of countries) {
      const result = await this.syncCountry(country);
      results.push(result);
    }

    const synced = results.filter((r) => r.status === 'synced').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;
    this.logger.log(`Market sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);

    return results;
  }

  async syncCountry(countryIso: string): Promise<SyncResult> {
    const iso = countryIso.toUpperCase();
    const adapter = this.adapterMap.get(iso);

    if (!adapter) {
      const outcome = { country: iso, status: 'error' as const, message: `No adapter registered for "${iso}"` };
      this.rememberSyncOutcome(outcome);
      return outcome;
    }

    // Deduplication: skip if a snapshot for today already exists
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const existing = await this.prisma.marketSnapshot.findFirst({
      where: {
        country: iso,
        snapshotDate: { gte: todayStart, lt: todayEnd },
        source: 'api',
      },
    });

    if (existing) {
      this.logger.log(`MarketSync [${iso}]: snapshot for today already exists (id=${existing.id}), skipping`);
      const outcome = { country: iso, status: 'skipped' as const, message: 'Already synced today' };
      this.rememberSyncOutcome(outcome);
      return outcome;
    }

    try {
      const result = await adapter.fetchMarketData(iso);

      if (result.totalVacancies <= 0 || result.skills.length === 0) {
        const outcome = {
          country: iso,
          status: 'skipped' as const,
          totalVacancies: result.totalVacancies,
          skillsImported: 0,
          message: 'Adapter returned empty result (check API credentials or coverage)',
        };
        this.rememberSyncOutcome(outcome);
        return outcome;
      }

      if (result.totalVacancies < MIN_VACANCIES_FOR_SNAPSHOT) {
        const outcome = {
          country: iso,
          status: 'skipped' as const,
          totalVacancies: result.totalVacancies,
          skillsImported: 0,
          message: `Low vacancy volume (${result.totalVacancies} < ${MIN_VACANCIES_FOR_SNAPSHOT}), snapshot not created`,
        };
        this.rememberSyncOutcome(outcome);
        return outcome;
      }

      // Resolve skill names to IDs and apply required-level defaults
      const resolvedSkills: { skillId: string; frequency: number; avgRequiredLevel: number }[] = [];

      for (const row of result.skills) {
        const skillId = this.normalizer.resolve(row.skillName);
        if (!skillId) continue;

        const category = this.normalizer.getCategory(skillId);
        const avgRequiredLevel = REQUIRED_LEVEL[category] ?? 0.70;

        resolvedSkills.push({ skillId, frequency: row.frequency, avgRequiredLevel });
      }

      if (resolvedSkills.length === 0) {
        const outcome = {
          country: iso,
          status: 'skipped' as const,
          totalVacancies: result.totalVacancies,
          skillsImported: 0,
          message: 'No skills resolved after normalization',
        };
        this.rememberSyncOutcome(outcome);
        return outcome;
      }

      if (resolvedSkills.length < MIN_RESOLVED_SKILLS_FOR_SNAPSHOT) {
        const outcome = {
          country: iso,
          status: 'skipped' as const,
          totalVacancies: result.totalVacancies,
          skillsImported: resolvedSkills.length,
          message: `Too few resolved skills (${resolvedSkills.length} < ${MIN_RESOLVED_SKILLS_FOR_SNAPSHOT}), snapshot not created`,
        };
        this.rememberSyncOutcome(outcome);
        return outcome;
      }

      const snapshot = await this.prisma.marketSnapshot.create({
        data: {
          snapshotDate: todayStart,
          source: 'api',
          country: iso,
          totalVacancies: result.totalVacancies,
          skillDemands: {
            create: resolvedSkills.map((s) => ({
              skillId: s.skillId,
              frequency: s.frequency,
              avgRequiredLevel: s.avgRequiredLevel,
            })),
          },
        },
      });

      this.logger.log(
        `MarketSync [${iso}]: created snapshot ${snapshot.id} - ${resolvedSkills.length} skills, ${result.totalVacancies} vacancies`,
      );

      const outcome = {
        country: iso,
        status: 'synced' as const,
        totalVacancies: result.totalVacancies,
        skillsImported: resolvedSkills.length,
      };
      this.rememberSyncOutcome(outcome);
      return outcome;
    } catch (err: any) {
      const message = err?.message ?? 'Unknown sync error';
      this.logger.error(`MarketSync [${iso}]: ${message}`);
      const outcome = { country: iso, status: 'error' as const, message };
      this.rememberSyncOutcome(outcome);
      return outcome;
    }
  }

  private rememberSyncOutcome(result: SyncResult) {
    this.lastSyncOutcome.set(result.country, { ...result, updatedAt: new Date() });
  }

  async getLastSnapshots(): Promise<Record<string, CountrySyncStatus>> {
    const countries = ['DE', 'NL', 'CA', 'GB', 'PL'];
    const result: Record<string, CountrySyncStatus> = {};

    for (const country of countries) {
      const snapshot = await this.prisma.marketSnapshot.findFirst({
        where: { country },
        orderBy: { snapshotDate: 'desc' },
        include: { _count: { select: { skillDemands: true } } },
      });
      const syncOutcome = this.lastSyncOutcome.get(country);

      result[country] = {
        date: snapshot?.snapshotDate ?? null,
        source: snapshot?.source ?? null,
        skills: snapshot?._count.skillDemands ?? 0,
        status: syncOutcome?.status ?? 'unknown',
        totalVacancies: syncOutcome?.totalVacancies ?? null,
        skillsImported: syncOutcome?.skillsImported ?? null,
        message: syncOutcome?.message ?? null,
        updatedAt: syncOutcome?.updatedAt ?? null,
      };
    }

    return result;
  }
}
