import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MarketService } from './market.service.js';
import { MarketSyncService } from './market-sync.service.js';
import { ImportMarketDto } from './dto/import-market.dto.js';
import { ImportJobPostingsDto } from './dto/import-job-postings.dto.js';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { Role } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('Admin Market')
@ApiBearerAuth()
export class MarketController {
  constructor(
    private readonly marketService: MarketService,
    private readonly marketSyncService: MarketSyncService,
  ) {}

  @Post('admin/import/market')
  importManual(@Body() dto: ImportMarketDto) {
    return this.marketService.importManual(dto);
  }

  @Post('admin/import/job-postings')
  importJobPostings(@Body() dto: ImportJobPostingsDto) {
    return this.marketService.importJobPostings(dto);
  }

  @Post('admin/sync/market')
  syncAll() {
    return this.marketSyncService.syncAll('manual', { force: true });
  }

  @Post('admin/sync/market/:country')
  syncCountry(@Param('country') country: string) {
    return this.marketSyncService.syncCountry(country, { force: true });
  }

  @Get('admin/sync/market/status')
  getSyncStatus() {
    return this.marketSyncService.getLastSnapshots();
  }

  @Get('admin/sync/market/health')
  getSyncHealth() {
    return this.marketSyncService.getHealthStatus();
  }

  @Get('admin/sync/market/runs')
  getSyncRuns(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    const safeLimit = Number.isFinite(parsed) ? parsed : 20;
    return this.marketSyncService.getRunHistory(safeLimit);
  }
}
