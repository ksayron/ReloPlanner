import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { ResumeController } from './resume.controller.js';
import { ResumeTextExtractionService } from './resume-text-extraction.service.js';
import { ResumeProfileDraftService } from './resume-profile-draft.service.js';

@Module({
  imports: [BillingModule],
  controllers: [ResumeController],
  providers: [ResumeTextExtractionService, ResumeProfileDraftService],
  exports: [ResumeTextExtractionService, ResumeProfileDraftService],
})
export class ResumeModule {}
