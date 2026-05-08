import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  ILiveMarketAdapter,
  LiveJobPosting,
  LiveMarketResult,
  MarketDataRow,
} from './market-data.adapter.js';

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

const ROLE_SEARCH_TERMS: Record<string, string> = {
  'Frontend Developer': 'frontend developer react typescript',
  'Backend Developer': 'backend developer node.js api',
  'Full-Stack Developer': 'full stack developer javascript',
  'DevOps Engineer': 'devops engineer kubernetes docker',
  'Data Scientist': 'data scientist python machine learning',
  'Data Engineer': 'data engineer sql python etl',
  'Mobile Developer': 'mobile developer react native ios android',
  'QA Engineer': 'qa engineer test automation',
  'Software Architect': 'software architect',
  'Engineering Manager': 'engineering manager',
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

  async fetchJobPostings(
    countryIso: string,
    roleNames: string[],
    options: { maxPerRole?: number } = {},
  ): Promise<LiveJobPosting[]> {
    const countryCode = ADZUNA_COUNTRY_CODES[countryIso.toUpperCase()];
    if (!countryCode) return [];

    const appId = this.config.get<string>('ADZUNA_APP_ID');
    const appKey = this.config.get<string>('ADZUNA_APP_KEY');
    if (!appId || !appKey || appId === 'your_app_id' || appKey === 'your_app_key') {
      return [];
    }

    const maxPerRole = Number.isFinite(options.maxPerRole) ? Math.max(1, Math.min(30, Math.trunc(options.maxPerRole!))) : 12;
    const pages = Math.max(1, Math.ceil(maxPerRole / 20));

    const seen = new Set<string>();
    const postings: LiveJobPosting[] = [];

    for (const roleName of roleNames) {
      const what = ROLE_SEARCH_TERMS[roleName] ?? roleName;
      for (let page = 1; page <= pages; page++) {
        await new Promise((r) => setTimeout(r, 120));
        try {
          const response = await firstValueFrom(
            this.http.get(`${BASE_URL}/${countryCode}/search/${page}`, {
              params: {
                app_id: appId,
                app_key: appKey,
                results_per_page: 20,
                category: 'it-jobs',
                what,
              },
              timeout: HTTP_TIMEOUT_MS,
            }),
          );
          const results = Array.isArray(response.data?.results) ? response.data.results : [];
          for (const row of results) {
            const sourceExternalId = String(row?.id ?? '').trim() || undefined;
            const sourceUrl = typeof row?.redirect_url === 'string' ? row.redirect_url : undefined;
            const dedupRef = sourceExternalId ?? sourceUrl;
            if (!dedupRef || seen.has(dedupRef)) continue;
            seen.add(dedupRef);

            postings.push({
              countryCode: countryIso.toUpperCase(),
              roleName,
              title: String(row?.title ?? 'Unknown title'),
              company: String(row?.company?.display_name ?? 'Unknown company'),
              location: String(row?.location?.display_name ?? countryIso.toUpperCase()),
              source: 'adzuna',
              sourceUrl,
              sourceExternalId,
              salaryMinUsd: this.toNullableInt(row?.salary_min),
              salaryMaxUsd: this.toNullableInt(row?.salary_max),
              salaryCurrency: null,
              description: typeof row?.description === 'string' ? row.description : '',
            });
          }
        } catch (err: any) {
          this.logger.warn(
            `AdzunaAdapter [${countryIso}] role="${roleName}" page=${page} failed: ${err?.message ?? err}`,
          );
        }
      }
    }

    return postings;
  }

  private toNullableInt(value: unknown): number | null {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    const rounded = Math.round(num);
    return rounded >= 0 ? rounded : null;
  }
}
