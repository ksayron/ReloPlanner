import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ColService } from './col.service.js';
import { WhereNextService } from './wherenext.service.js';
import { ColSyncService } from './col-sync.service.js';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller('cost-of-living')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Cost of Living')
@ApiBearerAuth()
export class ColController {
  constructor(
    private readonly colService: ColService,
    private readonly whereNext: WhereNextService,
    private readonly colSync: ColSyncService,
  ) {}

  @Get('compare')
  compare(@Query('city1') city1: string, @Query('city2') city2: string) {
    return this.colService.compare(city1, city2);
  }

  @Get('cities')
  listCities() {
    return this.colService.listCities();
  }

  /** Returns the full WhereNext cost-of-living index (95 countries) */
  @Get('index')
  getIndex() {
    return this.whereNext.get('costOfLiving');
  }

  /** Returns city-level item prices from WhereNext (51 cities) */
  @Get('city-prices')
  getCityPrices() {
    return this.whereNext.get('cityPrices');
  }

  /** Returns the WhereNext relocation index */
  @Get('relocation-index')
  getRelocationIndex() {
    return this.whereNext.get('relocationIndex');
  }

  /** Returns expat tax rates */
  @Get('expat-tax-rates')
  getExpatTaxRates() {
    return this.whereNext.get('expatTaxRates');
  }

  /** Returns digital nomad visa index */
  @Get('digital-nomad-visas')
  getDigitalNomadVisas() {
    return this.whereNext.get('digitalNomadVisas');
  }

  /** Returns cache status + last refresh time */
  @Get('cache-status')
  getCacheStatus() {
    const lastRefreshed = this.whereNext.getLastRefreshed();
    const ageMinutes = lastRefreshed
      ? Math.floor((Date.now() - lastRefreshed.getTime()) / (60 * 1000))
      : null;
    const staleThresholdMinutes = 90;
    return {
      lastRefreshed,
      ageMinutes,
      staleThresholdMinutes,
      isStale: ageMinutes == null ? true : ageMinutes > staleThresholdMinutes,
      endpoints: this.whereNext.getStatus(),
    };
  }

  /** Admin: refresh CoL DB rows from WhereNext cache */
  @Post('sync')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async syncCol() {
    const result = await this.colSync.sync();
    return { message: 'CoL sync completed', ...result };
  }

  /** Admin: sync health summary */
  @Get('sync/status')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getSyncStatus() {
    return this.colSync.getHealthStatus();
  }

  /** Admin: last N sync runs */
  @Get('sync/runs')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  getSyncRuns(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    const safeLimit = Number.isFinite(parsed) ? parsed : 20;
    return this.colSync.getRunHistory(safeLimit);
  }
}
