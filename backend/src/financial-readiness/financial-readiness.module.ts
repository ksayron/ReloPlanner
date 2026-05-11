import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import {
  FinancialReadinessController,
  ProfileFinancialReadinessController,
} from './financial-readiness.controller.js';
import { FinancialKnowledgeEngineService } from './financial-knowledge-engine.service.js';
import { FinancialReadinessService } from './financial-readiness.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [FinancialReadinessController, ProfileFinancialReadinessController],
  providers: [FinancialReadinessService, FinancialKnowledgeEngineService],
  exports: [FinancialReadinessService, FinancialKnowledgeEngineService],
})
export class FinancialReadinessModule {}
