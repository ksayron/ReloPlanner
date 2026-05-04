import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MarketService } from './market.service.js';
import { MarketSyncService } from './market-sync.service.js';
import { ImportMarketDto } from './dto/import-market.dto.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly marketSyncService: MarketSyncService,
  ) {}

  @Post('admin/import/market')
  importManual(@Body() dto: ImportMarketDto) {
    return this.marketService.importManual(dto);
  }

  @Post('admin/sync/market')
  syncAll() {
    return this.marketSyncService.syncAll();
  }

  @Post('admin/sync/market/:country')
  syncCountry(@Param('country') country: string) {
    return this.marketSyncService.syncCountry(country);
  }

  @Get('admin/sync/market/status')
  getSyncStatus() {
    return this.marketSyncService.getLastSnapshots();
  }
}
