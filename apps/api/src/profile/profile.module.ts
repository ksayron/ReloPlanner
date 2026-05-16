import { Module } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller';
import { ProfileComparisonService } from './profile-comparison.service';
import { BillingModule } from '../billing/billing.module';
import { ScoringModule } from '../scoring/scoring.module';
import { FinancialReadinessModule } from '../financial-readiness/financial-readiness.module';
import { LegalReadinessModule } from '../legal-readiness/legal-readiness.module';

@Module({
  imports: [
    BillingModule,
    ScoringModule,
    FinancialReadinessModule,
    LegalReadinessModule,
  ],
  providers: [ProfileService, ProfileComparisonService],
  controllers: [ProfileController],
})
export class ProfileModule {}
