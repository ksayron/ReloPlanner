import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ILiveMarketAdapter, LiveMarketResult, MarketDataRow } from './market-data.adapter.js';

const BASE_URL = 'https://api.adzuna.com/v1/api/jobs';
const HTTP_TIMEOUT_MS = 12000;

/** Maps our ISO country codes to Adzuna country codes */
const ADZUNA_COUNTRY_CODES: Record<string, string> = {
  DE: 'de',
  NL: 'nl',
  CA: 'ca',
  GB: 'gb',
  PL: 'pl',
};

/**
 * Maps canonical skill names to Adzuna search terms.
 * Terms are comma-separated for `what_or` param (Adzuna OR logic).
 * Using specific enough terms to avoid false positives.
 */
const SKILL_SEARCH_TERMS: Record<string, string> = {
  JavaScript: 'javascript',
  TypeScript: 'typescript',
  Python: 'python',
  Java: 'java',
  'C#': 'c#,dotnet,.net',
  Go: 'golang',
  React: 'react,reactjs',
  Angular: 'angular',
  Vue: 'vue.js,vuejs',
  'Node.js': 'node.js,nodejs',
  Express: 'express.js,expressjs',
  NestJS: 'nestjs',
  Django: 'django',
  'Spring Boot': 'spring boot,springboot',
  PostgreSQL: 'postgresql',
  MySQL: 'mysql',
  MongoDB: 'mongodb',
  Redis: 'redis',
  Docker: 'docker',
  Kubernetes: 'kubernetes,k8s',
  AWS: 'aws,amazon web services',
  Azure: 'azure',
  Git: 'git',
  'CI/CD': 'ci/cd,jenkins,github actions',
  'REST API': 'rest api,restful',
  GraphQL: 'graphql',
  Linux: 'linux',
  English: 'english speaking',
  German: 'german speaking,deutsch',
  French: 'french speaking',
  Polish: 'polish speaking',
  Spanish: 'spanish speaking',
  'AWS Certified': 'aws certified',
  'Azure Certified': 'azure certification,azure certified',
  IELTS: 'ielts',
  'Goethe-Zertifikat': 'goethe zertifikat,goethe certificate',
};

@Injectable()
export class AdzunaAdapter implements ILiveMarketAdapter {
  private readonly logger = new Logger(AdzunaAdapter.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async fetchMarketData(countryIso: string): Promise<LiveMarketResult> {
    const countryCode = ADZUNA_COUNTRY_CODES[countryIso.toUpperCase()];
    if (!countryCode) {
      throw new Error(`AdzunaAdapter: unsupported country "${countryIso}". Supported: ${Object.keys(ADZUNA_COUNTRY_CODES).join(', ')}`);
    }

    const appId = this.config.get<string>('ADZUNA_APP_ID');
    const appKey = this.config.get<string>('ADZUNA_APP_KEY');

    if (!appId || !appKey || appId === 'your_app_id' || appKey === 'your_app_key') {
      this.logger.warn(`AdzunaAdapter: API credentials not set, skipping ${countryIso}`);
      return { totalVacancies: 0, skills: [] };
    }

    const baseParams = {
      app_id: appId,
      app_key: appKey,
      results_per_page: 1,
      category: 'it-jobs',
    };

    // Get baseline count of IT developer jobs for this country
    let totalVacancies = 0;
    try {
      const totalResp = await firstValueFrom(
        this.http.get(`${BASE_URL}/${countryCode}/search/1`, {
          params: { ...baseParams, what: 'developer' },
          timeout: HTTP_TIMEOUT_MS,
        }),
      );
      totalVacancies = Number(totalResp.data?.count ?? 0);
      if (!Number.isFinite(totalVacancies) || totalVacancies < 0) {
        totalVacancies = 0;
      }
    } catch (err: any) {
      this.logger.error(`AdzunaAdapter [${countryIso}]: failed to fetch total count - ${err.message}`);
      return { totalVacancies: 0, skills: [] };
    }

    if (totalVacancies === 0) {
      this.logger.warn(`AdzunaAdapter [${countryIso}]: no IT jobs found`);
      return { totalVacancies: 0, skills: [] };
    }

    this.logger.log(`AdzunaAdapter [${countryIso}]: baseline ${totalVacancies} IT jobs, fetching skill counts...`);

    const skills: MarketDataRow[] = [];

    for (const [skillName, whatOr] of Object.entries(SKILL_SEARCH_TERMS)) {
      // Respect Adzuna rate limits: ~100ms between requests
      await new Promise((r) => setTimeout(r, 120));

      try {
        const resp = await firstValueFrom(
          this.http.get(`${BASE_URL}/${countryCode}/search/1`, {
            params: { ...baseParams, what_or: whatOr },
            timeout: HTTP_TIMEOUT_MS,
          }),
        );
        const count = Number(resp.data?.count ?? 0);
        if (!Number.isFinite(count) || count <= 0) continue;

        const frequency = Math.min(count / totalVacancies, 1.0);

        if (frequency > 0.005) {
          skills.push({
            skillName,
            frequency: Math.round(frequency * 10000) / 10000,
            avgRequiredLevel: 0, // set by MarketSyncService based on skill category
          });
        }
      } catch (err: any) {
        this.logger.warn(`AdzunaAdapter [${countryIso}]: failed for "${skillName}" - ${err.message}`);
      }
    }

    this.logger.log(`AdzunaAdapter [${countryIso}]: found ${skills.length} skills with frequency > 0.5%`);
    return { totalVacancies, skills };
  }
}
