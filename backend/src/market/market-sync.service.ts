import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { SkillNormalizerService } from './skill-normalizer.js';
import { AdzunaAdapter } from './adapters/adzuna.adapter.js';
import { ILiveMarketAdapter } from './adapters/market-data.adapter.js';
import { TARGET_COUNTRY_CODES } from '../countries/countries.data.js';

/** Default avgRequiredLevel by SkillCategory */
const REQUIRED_LEVEL: Record<string, number> = {
  HARD_SKILL: 0.7,
  LANGUAGE: 0.75,
  CERTIFICATION: 0.65,
  SOFT_SKILL: 0.6,
};

const MIN_VACANCIES_FOR_SNAPSHOT = 25;
const MIN_RESOLVED_SKILLS_FOR_SNAPSHOT = 5;
const MAX_SYNC_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const MAX_RUN_HISTORY = 30;
const STALE_THRESHOLD_MINUTES = 180;

export type SyncErrorKind = 'adapter' | 'normalization' | 'db' | 'unknown';
export type SyncFailureStage =
  | 'adapter_fetch'
  | 'normalization'
  | 'persistence'
  | 'unknown';
export type SyncTrigger = 'manual' | 'scheduled' | 'startup';
export interface SyncCountryOptions {
  force?: boolean;
}

export interface SyncAllOptions extends SyncCountryOptions {
  onProgress?: (event: {
    country: string;
    index: number;
    total: number;
    result?: SyncResult;
  }) => void | Promise<void>;
}

export interface SyncResult {
  country: string;
  status: 'synced' | 'skipped' | 'error';
  totalVacancies?: number;
  skillsImported?: number;
  message?: string;
  attempts?: number;
  errorKind?: SyncErrorKind | null;
  failureStage?: SyncFailureStage | null;
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
  attempts: number | null;
  errorKind: SyncErrorKind | null;
  failureStage: SyncFailureStage | null;
}

export interface MarketSyncRun {
  id: string;
  trigger: SyncTrigger;
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  status: 'success' | 'partial' | 'failed';
  summary: {
    synced: number;
    skipped: number;
    error: number;
  };
  results: SyncResult[];
}

@Injectable()
export class MarketSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MarketSyncService.name);
  private readonly adapterMap: Map<string, ILiveMarketAdapter> = new Map();
  private readonly lastSyncOutcome: Map<string, SyncResult & { updatedAt: Date }> =
    new Map();
  private readonly runHistory: MarketSyncRun[] = [];

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
    void this.syncAll('startup').catch((err) =>
      this.logger.error(`Startup market sync failed: ${err?.message ?? err}`),
    );
  }

  /** Runs every day at 02:00 UTC */
  @Cron('0 2 * * *')
  async scheduledSync() {
    this.logger.log('Running scheduled daily market sync...');
    await this.syncAll('scheduled');
  }

  async syncAll(
    trigger: SyncTrigger = 'manual',
    options: SyncAllOptions = {},
  ): Promise<SyncResult[]> {
    const startedAt = new Date();
    const runId = randomUUID();
    const countries = TARGET_COUNTRY_CODES;
    const results: SyncResult[] = [];

    for (let index = 0; index < countries.length; index++) {
      const country = countries[index];
      await options.onProgress?.({
        country,
        index,
        total: countries.length,
      });
      const result = await this.syncCountry(country, {
        force: options.force,
      });
      results.push(result);
      await options.onProgress?.({
        country,
        index: index + 1,
        total: countries.length,
        result,
      });
    }

    const synced = results.filter((r) => r.status === 'synced').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const finishedAt = new Date();
    const runStatus: MarketSyncRun['status'] =
      errors === countries.length
        ? 'failed'
        : errors > 0
          ? 'partial'
          : 'success';

    this.rememberRun({
      id: runId,
      trigger,
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status: runStatus,
      summary: { synced, skipped, error: errors },
      results,
    });

    this.logger.log(
      `Market sync complete [${trigger}] run=${runId}: ${synced} synced, ${skipped} skipped, ${errors} errors`,
    );

    return results;
  }

  async syncCountry(
    countryIso: string,
    options: SyncCountryOptions = {},
  ): Promise<SyncResult> {
    const iso = countryIso.toUpperCase();
    let lastOutcome: SyncResult = {
      country: iso,
      status: 'error',
      message: 'Unknown sync error',
      attempts: 1,
      errorKind: 'unknown',
      failureStage: 'unknown',
    };

    for (let attempt = 1; attempt <= MAX_SYNC_RETRIES + 1; attempt++) {
      const outcome = await this.syncCountryOnce(iso, attempt, options);
      lastOutcome = outcome;

      if (outcome.status !== 'error') {
        break;
      }

      if (!this.shouldRetry(outcome, attempt)) {
        break;
      }

      const delayMs = RETRY_BASE_DELAY_MS * attempt;
      this.logger.warn(
        `MarketSync [${iso}]: transient ${outcome.errorKind} error, retry ${attempt}/${MAX_SYNC_RETRIES} in ${delayMs}ms`,
      );
      await this.sleep(delayMs);
    }

    this.rememberSyncOutcome(lastOutcome);
    return lastOutcome;
  }

  private async syncCountryOnce(
    iso: string,
    attempt: number,
    options: SyncCountryOptions = {},
  ): Promise<SyncResult> {
    const adapter = this.adapterMap.get(iso);
    if (!adapter) {
      return {
        country: iso,
        status: 'error',
        message: `No adapter registered for "${iso}"`,
        attempts: attempt,
        errorKind: 'adapter',
        failureStage: 'adapter_fetch',
      };
    }

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
    if (existing && !options.force) {
      this.logger.log(
        `MarketSync [${iso}]: snapshot for today already exists (id=${existing.id}), skipping`,
      );
      return {
        country: iso,
        status: 'skipped',
        message: 'Already synced today',
        attempts: attempt,
        errorKind: null,
        failureStage: null,
      };
    }

    if (existing && options.force) {
      this.logger.log(
        `MarketSync [${iso}]: force mode enabled, creating fresh snapshot despite existing ${existing.id}`,
      );
    }

    let result: Awaited<ReturnType<ILiveMarketAdapter['fetchMarketData']>>;
    try {
      result = await adapter.fetchMarketData(iso);
    } catch (err: any) {
      const message = err?.message ?? 'Adapter fetch failed';
      this.logger.error(`MarketSync [${iso}] adapter: ${message}`);
      return {
        country: iso,
        status: 'error',
        message,
        attempts: attempt,
        errorKind: 'adapter',
        failureStage: 'adapter_fetch',
      };
    }

    if (result.totalVacancies <= 0 || result.skills.length === 0) {
      return {
        country: iso,
        status: 'skipped',
        totalVacancies: result.totalVacancies,
        skillsImported: 0,
        message: 'Adapter returned empty result (check API credentials or coverage)',
        attempts: attempt,
        errorKind: null,
        failureStage: null,
      };
    }

    if (result.totalVacancies < MIN_VACANCIES_FOR_SNAPSHOT) {
      return {
        country: iso,
        status: 'skipped',
        totalVacancies: result.totalVacancies,
        skillsImported: 0,
        message: `Low vacancy volume (${result.totalVacancies} < ${MIN_VACANCIES_FOR_SNAPSHOT}), snapshot not created`,
        attempts: attempt,
        errorKind: null,
        failureStage: null,
      };
    }

    const resolvedSkills: {
      skillId: string;
      frequency: number;
      avgRequiredLevel: number;
    }[] = [];

    for (const row of result.skills) {
      const skillId = this.normalizer.resolve(row.skillName);
      if (!skillId) continue;

      const category = this.normalizer.getCategory(skillId);
      const avgRequiredLevel = REQUIRED_LEVEL[category] ?? 0.7;
      resolvedSkills.push({
        skillId,
        frequency: row.frequency,
        avgRequiredLevel,
      });
    }

    if (resolvedSkills.length === 0) {
      return {
        country: iso,
        status: 'skipped',
        totalVacancies: result.totalVacancies,
        skillsImported: 0,
        message: 'No skills resolved after normalization',
        attempts: attempt,
        errorKind: 'normalization',
        failureStage: 'normalization',
      };
    }

    if (resolvedSkills.length < MIN_RESOLVED_SKILLS_FOR_SNAPSHOT) {
      return {
        country: iso,
        status: 'skipped',
        totalVacancies: result.totalVacancies,
        skillsImported: resolvedSkills.length,
        message: `Too few resolved skills (${resolvedSkills.length} < ${MIN_RESOLVED_SKILLS_FOR_SNAPSHOT}), snapshot not created`,
        attempts: attempt,
        errorKind: 'normalization',
        failureStage: 'normalization',
      };
    }

    try {
      const snapshot = await this.prisma.marketSnapshot.create({
        data: {
          snapshotDate: options.force ? new Date() : todayStart,
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

      return {
        country: iso,
        status: 'synced',
        totalVacancies: result.totalVacancies,
        skillsImported: resolvedSkills.length,
        attempts: attempt,
        errorKind: null,
        failureStage: null,
      };
    } catch (err: any) {
      const message = err?.message ?? 'Snapshot persistence failed';
      this.logger.error(`MarketSync [${iso}] db: ${message}`);
      return {
        country: iso,
        status: 'error',
        message,
        attempts: attempt,
        errorKind: 'db',
        failureStage: 'persistence',
      };
    }
  }

  private shouldRetry(outcome: SyncResult, attempt: number): boolean {
    if (attempt > MAX_SYNC_RETRIES) return false;
    if (outcome.status !== 'error') return false;
    if (!outcome.errorKind || (outcome.errorKind !== 'adapter' && outcome.errorKind !== 'db')) {
      return false;
    }

    const message = (outcome.message ?? '').toLowerCase();
    if (message.includes('no adapter registered')) return false;

    const transientHints = [
      'timeout',
      'timed out',
      'econnreset',
      'econnrefused',
      'eai_again',
      'enotfound',
      '429',
      '502',
      '503',
      '504',
      'temporarily unavailable',
      'rate limit',
    ];

    return transientHints.some((hint) => message.includes(hint)) || outcome.errorKind === 'db';
  }

  private rememberSyncOutcome(result: SyncResult) {
    this.lastSyncOutcome.set(result.country, { ...result, updatedAt: new Date() });
  }

  private rememberRun(run: MarketSyncRun) {
    this.runHistory.unshift(run);
    if (this.runHistory.length > MAX_RUN_HISTORY) {
      this.runHistory.length = MAX_RUN_HISTORY;
    }
  }

  async getLastSnapshots(): Promise<Record<string, CountrySyncStatus>> {
    const result: Record<string, CountrySyncStatus> = {};

    for (const country of TARGET_COUNTRY_CODES) {
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
        attempts: syncOutcome?.attempts ?? null,
        errorKind: syncOutcome?.errorKind ?? null,
        failureStage: syncOutcome?.failureStage ?? null,
      };
    }

    return result;
  }

  getRunHistory(limit = 20): MarketSyncRun[] {
    const safeLimit = Math.max(1, Math.min(limit, MAX_RUN_HISTORY));
    return this.runHistory.slice(0, safeLimit);
  }

  getHealthStatus() {
    const lastRun = this.runHistory[0] ?? null;
    const outcomes = Array.from(this.lastSyncOutcome.values());
    const staleCountries = outcomes
      .filter((outcome) => {
        const ageMinutes =
          (Date.now() - outcome.updatedAt.getTime()) / (60 * 1000);
        return ageMinutes > STALE_THRESHOLD_MINUTES;
      })
      .map((outcome) => outcome.country);

    const errors = outcomes.filter((outcome) => outcome.status === 'error').length;
    const synced = outcomes.filter((outcome) => outcome.status === 'synced').length;
    const skipped = outcomes.filter((outcome) => outcome.status === 'skipped').length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!lastRun || lastRun.status === 'failed') status = 'unhealthy';
    else if (lastRun.status === 'partial' || errors > 0 || staleCountries.length > 0) {
      status = 'degraded';
    }

    return {
      status,
      staleThresholdMinutes: STALE_THRESHOLD_MINUTES,
      staleCountries,
      lastRun,
      summary: {
        synced,
        skipped,
        errors,
      },
    };
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
