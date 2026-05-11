import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  LegalReadinessController,
  ProfileLegalReadinessController,
} from './legal-readiness.controller.js';
import { LegalReadinessService } from './legal-readiness.service.js';
import { LegalKnowledgeEngineService } from './legal-knowledge-engine.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [LegalReadinessController, ProfileLegalReadinessController],
  providers: [LegalReadinessService, LegalKnowledgeEngineService],
  exports: [LegalReadinessService, LegalKnowledgeEngineService],
})
export class LegalReadinessModule {}
