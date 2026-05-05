import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ILiveMarketAdapter, LiveMarketResult, MarketDataRow } from './market-data.adapter.js';

const BASE_URL = 'https://www.arbeitnow.com/api/job-board-api';
const MAX_PAGES = 10;
const HTTP_TIMEOUT_MS = 12000;

/** Keywords used to identify Poland-based job listings */
const POLAND_LOCATION_KEYWORDS = [
  'poland',
  'polska',
  'warsaw',
  'warszawa',
  'krakow',
  'wroclaw',
  'gdansk',
  'poznan',
  'lodz',
  'katowice',
  'gdynia',
  'szczecin',
];

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

@Injectable()
export class ArbeitnowAdapter implements ILiveMarketAdapter {
  private readonly logger = new Logger(ArbeitnowAdapter.name);

  constructor(private readonly http: HttpService) {}

  async fetchMarketData(countryIso: string): Promise<LiveMarketResult> {
    if (countryIso.toUpperCase() !== 'PL') {
      throw new Error(
        `ArbeitnowAdapter only supports PL, got "${countryIso}"`,
      );
    }

    const allJobs: any[] = [];
    let page = 1;
    let pagesFetched = 0;

    while (page <= MAX_PAGES) {
      await new Promise((r) => setTimeout(r, 200));

      try {
        const resp = await firstValueFrom(
          this.http.get(BASE_URL, { params: { page }, timeout: HTTP_TIMEOUT_MS }),
        );
        const jobs: any[] = Array.isArray(resp.data?.data) ? resp.data.data : [];
        if (!jobs.length) break;

        allJobs.push(...jobs);
        pagesFetched++;

        if (!resp.data?.links?.next) break;
        page++;
      } catch (err: any) {
        this.logger.error(`ArbeitnowAdapter: error fetching page ${page} - ${err.message}`);
        break;
      }
    }

    this.logger.log(`ArbeitnowAdapter: fetched ${allJobs.length} total jobs across ${pagesFetched} pages`);

    // Filter for Poland-based listings.
    // API location strings are inconsistent, so we match across multiple text fields.
    const polishJobs = allJobs.filter((job) => {
      const location = normalizeText(job.location);
      const title = normalizeText(job.title);
      const company = normalizeText(job.company_name);
      const tags = Array.isArray(job.tags)
        ? normalizeText(job.tags.join(' '))
        : '';
      const searchable = `${location} ${title} ${company} ${tags}`;
      return POLAND_LOCATION_KEYWORDS.some((kw) => searchable.includes(kw));
    });

    const totalVacancies = polishJobs.length;
    this.logger.log(`ArbeitnowAdapter: ${totalVacancies} Poland-matching jobs`);

    if (totalVacancies === 0) {
      this.logger.warn('ArbeitnowAdapter: no Poland jobs found - returning empty result');
      return { totalVacancies: 0, skills: [] };
    }

    // Count how many jobs contain each tag
    const tagCounts = new Map<string, number>();
    for (const job of polishJobs) {
      const tags: string[] = Array.isArray(job.tags) ? job.tags : [];
      // Deduplicate per job so one job doesn't inflate the same tag multiple times
      const uniqueTags = [...new Set(tags.map((t: string) => t.toLowerCase().trim()).filter(Boolean))];
      for (const tag of uniqueTags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const skills: MarketDataRow[] = [];
    for (const [tag, count] of tagCounts.entries()) {
      const frequency = Math.min(count / totalVacancies, 1.0);
      if (frequency > 0.005) {
        skills.push({
          skillName: tag,
          frequency: Math.round(frequency * 10000) / 10000,
          avgRequiredLevel: 0, // set by MarketSyncService based on skill category
        });
      }
    }

    // Sort by frequency descending for readability in logs
    skills.sort((a, b) => b.frequency - a.frequency);
    this.logger.log(`ArbeitnowAdapter [PL]: ${skills.length} distinct skill tags with frequency > 0.5%`);

    return { totalVacancies, skills };
  }
}
