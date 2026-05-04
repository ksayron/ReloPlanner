import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TaxonomyModule } from './taxonomy/taxonomy.module.js';
import { ProfileModule } from './profile/profile.module.js';
import { ScoringModule } from './scoring/scoring.module.js';
import { MarketModule } from './market/market.module.js';
import { ColModule } from './cost-of-living/col.module.js';
import { ProgressModule } from './progress/progress.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    TaxonomyModule,
    ProfileModule,
    ScoringModule,
    MarketModule,
    ColModule,
    ProgressModule,
  ],
})
export class AppModule {}
