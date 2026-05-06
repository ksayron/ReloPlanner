import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { WhereNextService } from './wherenext.service.js';
import { TARGET_CITY_BY_COUNTRY } from '../countries/countries.data.js';

/** Maps ISO country code → primary target city name used in our DB */
const COUNTRY_CITY_MAP: Record<string, string> = TARGET_CITY_BY_COUNTRY;

/** CostCategory values that align with our Prisma enum */
const CATEGORIES = ['RENT', 'FOOD', 'UTILITIES', 'TRANSPORT'] as const;

export interface ColSyncSkippedItem {
  countryIso: string;
  city: string;
  reason: string;
}

export interface ColSyncResult {
  updated: string[];
  skipped: ColSyncSkippedItem[];
}

@Injectable()
export class ColSyncService {
  private readonly logger = new Logger(ColSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whereNext: WhereNextService,
  ) {}

  async sync(): Promise<ColSyncResult> {
    const colData = this.whereNext.get('costOfLiving');

    if (!colData?.data) {
      this.logger.warn('ColSync: WhereNext costOfLiving data not available in cache');
      return {
        updated: [],
        skipped: Object.entries(COUNTRY_CITY_MAP).map(([countryIso, city]) => ({
          countryIso,
          city,
          reason: 'Cache dataset "costOfLiving" is not loaded',
        })),
      };
    }

    const updated: string[] = [];
    const skipped: ColSyncSkippedItem[] = [];

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
        UTILITIES: Math.round(((utilities_index ?? 25) / total) * monthly_estimate_usd),
        TRANSPORT: Math.round(((transport_index ?? 25) / total) * monthly_estimate_usd),
      };

      // Replace all CoL data for this city atomically
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

      this.logger.log(
        `ColSync: updated ${cityName} (${countryIso}) — RENT=$${amounts.RENT} FOOD=$${amounts.FOOD} UTIL=$${amounts.UTILITIES} TRANS=$${amounts.TRANSPORT}`,
      );
      updated.push(cityName);
    }

    return { updated, skipped };
  }
}
