import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ColService } from './col.service.js';
import { WhereNextService } from './wherenext.service.js';
import { ColSyncService } from './col-sync.service.js';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { Role } from '@prisma/client';

@Controller('cost-of-living')
@UseGuards(AuthGuard('jwt'))
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
    return {
      lastRefreshed: this.whereNext.getLastRefreshed(),
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
}
