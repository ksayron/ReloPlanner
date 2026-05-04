import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { SkillNormalizerService } from './skill-normalizer.js';
import { AdzunaAdapter } from './adapters/adzuna.adapter.js';
import { ArbeitnowAdapter } from './adapters/arbeitnow.adapter.js';
import { ILiveMarketAdapter } from './adapters/market-data.adapter.js';

/** Default avgRequiredLevel by SkillCategory */
const REQUIRED_LEVEL: Record<string, number> = {
  HARD_SKILL: 0.70,
  LANGUAGE: 0.75,
  CERTIFICATION: 0.65,
  SOFT_SKILL: 0.60,
};

export interface SyncResult {
  country: string;
  status: 'synced' | 'skipped' | 'error';
  totalVacancies?: number;
  skillsImported?: number;
  message?: string;
}

@Injectable()
export class MarketSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketSyncService.name);

  private readonly adapterMap: Map<string, ILiveMarketAdapter> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly normalizer: SkillNormalizerService,
    private readonly adzuna: AdzunaAdapter,
    private readonly arbeitnow: ArbeitnowAdapter,
  ) {
    this.adapterMap.set('DE', adzuna);
    this.adapterMap.set('NL', adzuna);
    this.adapterMap.set('CA', adzuna);
    this.adapterMap.set('GB', adzuna);
    this.adapterMap.set('PL', arbeitnow);
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
      return { country: iso, status: 'error', message: `No adapter registered for "${iso}"` };
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
      return { country: iso, status: 'skipped', message: 'Already synced today' };
    }

    try {
      const result = await adapter.fetchMarketData(iso);

      if (result.totalVacancies === 0 || result.skills.length === 0) {
        return {
          country: iso,
          status: 'error',
          message: 'Adapter returned empty result (check API credentials or coverage)',
        };
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
        return { country: iso, status: 'error', message: 'No skills resolved after normalization' };
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
        `MarketSync [${iso}]: created snapshot ${snapshot.id} — ${resolvedSkills.length} skills, ${result.totalVacancies} vacancies`,
      );

      return {
        country: iso,
        status: 'synced',
        totalVacancies: result.totalVacancies,
        skillsImported: resolvedSkills.length,
      };
    } catch (err: any) {
      this.logger.error(`MarketSync [${iso}]: ${err.message}`);
      return { country: iso, status: 'error', message: err.message };
    }
  }

  async getLastSnapshots(): Promise<Record<string, { date: Date; source: string; skills: number } | null>> {
    const countries = ['DE', 'NL', 'CA', 'GB', 'PL'];
    const result: Record<string, any> = {};

    for (const country of countries) {
      const snapshot = await this.prisma.marketSnapshot.findFirst({
        where: { country },
        orderBy: { snapshotDate: 'desc' },
        include: { _count: { select: { skillDemands: true } } },
      });

      result[country] = snapshot
        ? { date: snapshot.snapshotDate, source: snapshot.source, skills: snapshot._count.skillDemands }
        : null;
    }

    return result;
  }
}
