import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhereNextService } from './wherenext.service.js';
import { TARGET_CITY_BY_COUNTRY } from '../countries/countries.data.js';

/** Maps ISO country code to primary target city used in DB */
const COUNTRY_CITY_MAP: Record<string, string> = TARGET_CITY_BY_COUNTRY;
const CATEGORIES = ['RENT', 'FOOD', 'UTILITIES', 'TRANSPORT'] as const;
const MAX_SYNC_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const MAX_RUN_HISTORY = 30;

export interface ColSyncSkippedItem {
  countryIso: string;
  city: string;
  reason: string;
}

export interface ColSyncResult {
  updated: string[];
  skipped: ColSyncSkippedItem[];
}

export interface ColSyncRun {
  id: string;
  trigger: 'manual';
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;
  status: 'success' | 'partial' | 'failed';
  failureKind: 'adapter' | 'db' | 'unknown' | null;
  message: string | null;
  updatedCount: number;
  skippedCount: number;
  result: ColSyncResult;
}

@Injectable()
export class ColSyncService {
  private readonly logger = new Logger(ColSyncService.name);
  private readonly runHistory: ColSyncRun[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly whereNext: WhereNextService,
  ) {}

  async sync(): Promise<ColSyncResult> {
    const startedAt = new Date();
    const runId = randomUUID();
    const colData = this.whereNext.get('costOfLiving');

    if (!colData?.data) {
      const result: ColSyncResult = {
        updated: [],
        skipped: Object.entries(COUNTRY_CITY_MAP).map(([countryIso, city]) => ({
          countryIso,
          city,
          reason: 'Cache dataset "costOfLiving" is not loaded',
        })),
      };
      this.rememberRun({
        id: runId,
        trigger: 'manual',
        startedAt,
        finishedAt: new Date(),
        durationMs: Date.now() - startedAt.getTime(),
        status: 'failed',
        failureKind: 'adapter',
        message: 'WhereNext cache is unavailable',
        updatedCount: 0,
        skippedCount: result.skipped.length,
        result,
      });
      this.logger.warn('ColSync: WhereNext costOfLiving cache is unavailable');
      return result;
    }

    const updated: string[] = [];
    const skipped: ColSyncSkippedItem[] = [];
    let hardErrors = 0;

    for (const [countryIso, cityName] of Object.entries(COUNTRY_CITY_MAP)) {
      const countryData = (colData.data as any[]).find(
        (d) => d.country_code?.toUpperCase() === countryIso,
      );

      if (!countryData) {
        this.logger.warn(`ColSync: no WhereNext data for country "${countryIso}"`);
        skipped.push({
          countryIso,
          city: cityName,
          reason: `No source record for country "${countryIso}"`,
        });
        continue;
      }

      const {
        monthly_estimate_usd,
        rent_index,
        grocery_index,
        utilities_index,
        transport_index,
        country: countryName,
      } = countryData;

      const total =
        (rent_index ?? 25) +
        (grocery_index ?? 25) +
        (utilities_index ?? 25) +
        (transport_index ?? 25);

      const amounts: Record<string, number> = {
        RENT: Math.round(((rent_index ?? 25) / total) * monthly_estimate_usd),
        FOOD: Math.round(((grocery_index ?? 25) / total) * monthly_estimate_usd),
        UTILITIES: Math.round(
          ((utilities_index ?? 25) / total) * monthly_estimate_usd,
        ),
        TRANSPORT: Math.round(
          ((transport_index ?? 25) / total) * monthly_estimate_usd,
        ),
      };

      let persisted = false;
      let lastDbMessage = '';
      for (let attempt = 1; attempt <= MAX_SYNC_RETRIES + 1; attempt++) {
        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.costOfLivingData.deleteMany({ where: { city: cityName } });
            await tx.costOfLivingData.createMany({
              data: CATEGORIES.map((category) => ({
                country: countryName ?? countryIso,
                city: cityName,
                category: category as any,
                avgMonthlyUsd: amounts[category],
              })),
            });
          });
          persisted = true;
          break;
        } catch (err: any) {
          lastDbMessage = err?.message ?? 'Unknown DB sync error';
          if (attempt <= MAX_SYNC_RETRIES && this.isTransientDbError(lastDbMessage)) {
            const delayMs = RETRY_BASE_DELAY_MS * attempt;
            this.logger.warn(
              `ColSync [${countryIso}/${cityName}]: transient DB error, retry ${attempt}/${MAX_SYNC_RETRIES} in ${delayMs}ms`,
            );
            await this.sleep(delayMs);
            continue;
          }
          break;
        }
      }

      if (!persisted) {
        hardErrors += 1;
        skipped.push({
          countryIso,
          city: cityName,
          reason: `DB sync failed: ${lastDbMessage || 'unknown error'}`,
        });
        continue;
      }

      this.logger.log(
        `ColSync: updated ${cityName} (${countryIso}) RENT=$${amounts.RENT} FOOD=$${amounts.FOOD} UTIL=$${amounts.UTILITIES} TRANS=$${amounts.TRANSPORT}`,
      );
      updated.push(cityName);
    }

    const result: ColSyncResult = { updated, skipped };
    const finishedAt = new Date();
    const status: ColSyncRun['status'] =
      hardErrors > 0 && updated.length === 0
        ? 'failed'
        : hardErrors > 0 || skipped.length > 0
          ? 'partial'
          : 'success';

    this.rememberRun({
      id: runId,
      trigger: 'manual',
      startedAt,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      status,
      failureKind: hardErrors > 0 ? 'db' : null,
      message: hardErrors > 0 ? `${hardErrors} city sync operations failed` : null,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      result,
    });

    return result;
  }

  getRunHistory(limit = 20): ColSyncRun[] {
    const safeLimit = Math.max(1, Math.min(limit, MAX_RUN_HISTORY));
    return this.runHistory.slice(0, safeLimit);
  }

  getHealthStatus() {
    const lastRun = this.runHistory[0] ?? null;
    const endpoints = this.whereNext.getStatus();
    const loadedEndpoints = Object.values(endpoints).filter(Boolean).length;
    const totalEndpoints = Object.keys(endpoints).length;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!lastRun || lastRun.status === 'failed') status = 'unhealthy';
    else if (
      lastRun.status === 'partial' ||
      loadedEndpoints < totalEndpoints
    ) {
      status = 'degraded';
    }

    return {
      status,
      lastRun,
      cache: {
        lastRefreshed: this.whereNext.getLastRefreshed(),
        endpoints,
        loadedEndpoints,
        totalEndpoints,
      },
    };
  }

  private rememberRun(run: ColSyncRun) {
    this.runHistory.unshift(run);
    if (this.runHistory.length > MAX_RUN_HISTORY) {
      this.runHistory.length = MAX_RUN_HISTORY;
    }
  }

  private isTransientDbError(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('econnreset') ||
      lower.includes('econnrefused') ||
      lower.includes('too many') ||
      lower.includes('deadlock')
    );
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
