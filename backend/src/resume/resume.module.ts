import { Module } from '@nestjs/common';
import { ResumeController } from './resume.controller.js';
import { ResumeTextExtractionService } from './resume-text-extraction.service.js';

@Module({
  controllers: [ResumeController],
  providers: [ResumeTextExtractionService],
  exports: [ResumeTextExtractionService],
})
export class ResumeModule {}
