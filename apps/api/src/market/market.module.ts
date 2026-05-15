import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MarketService } from './market.service.js';
import { MarketController } from './market.controller.js';
import { MarketSyncService } from './market-sync.service.js';
import { SkillNormalizerService } from './skill-normalizer.js';
import { MarketDigestService } from './market-digest.service.js';
import { MarketDigestController } from './market-digest.controller.js';
import { AdzunaAdapter } from './adapters/adzuna.adapter.js';
import { ArbeitnowAdapter } from './adapters/arbeitnow.adapter.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [MarketController, MarketDigestController],
  providers: [
    MarketService,
    MarketSyncService,
    MarketDigestService,
    SkillNormalizerService,
    AdzunaAdapter,
    ArbeitnowAdapter,
  ],
  exports: [
    MarketService,
    MarketSyncService,
    MarketDigestService,
    SkillNormalizerService,
  ],
})
export class MarketModule {}
