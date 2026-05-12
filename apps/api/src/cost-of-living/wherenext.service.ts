import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Cron } from '@nestjs/schedule';
import { firstValueFrom } from 'rxjs';

const WHERENEXT_ENDPOINTS: Record<string, string> = {
  costOfLiving: 'https://getwherenext.com/api/data/cost-of-living',
  cityPrices: 'https://getwherenext.com/api/data/city-prices',
  relocationIndex: 'https://getwherenext.com/api/data/relocation-index',
  expatTaxRates: 'https://getwherenext.com/api/data/expat-tax-rates',
  digitalNomadVisas: 'https://getwherenext.com/api/data/digital-nomad-visas',
};

@Injectable()
export class WhereNextService implements OnModuleInit {
  private readonly logger = new Logger(WhereNextService.name);
  private readonly cache = new Map<string, any>();
  private lastRefreshed: Date | null = null;

  constructor(private readonly http: HttpService) {}

  async onModuleInit() {
    await this.refreshAll();
  }

  /** Refresh all WhereNext datasets every hour */
  @Cron('0 * * * *')
  async refreshAll(): Promise<void> {
    this.logger.log('Refreshing WhereNext cache...');
    let successCount = 0;

    for (const [key, url] of Object.entries(WHERENEXT_ENDPOINTS)) {
      try {
        const resp = await firstValueFrom(this.http.get(url, { timeout: 15000 }));
        this.cache.set(key, resp.data);
        successCount++;
      } catch (err: any) {
        this.logger.warn(`WhereNext: failed to refresh "${key}" (${url}) — ${err.message}`);
      }
    }

    this.lastRefreshed = new Date();
    this.logger.log(
      `WhereNext cache refreshed: ${successCount}/${Object.keys(WHERENEXT_ENDPOINTS).length} endpoints OK`,
    );
  }

  /** Returns cached data for a given endpoint key, or null if not yet loaded. */
  get(key: string): any {
    return this.cache.get(key) ?? null;
  }

  getLastRefreshed(): Date | null {
    return this.lastRefreshed;
  }

  getStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const key of Object.keys(WHERENEXT_ENDPOINTS)) {
      status[key] = this.cache.has(key);
    }
    return status;
  }
}
