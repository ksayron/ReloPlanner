import { Module } from '@nestjs/common';
import { MarketModule } from '../market/market.module.js';
import { ScoringModule } from '../scoring/scoring.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsEventBusService } from './jobs-event-bus.service.js';
import { JobsRunnerService } from './jobs-runner.service.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [ScoringModule, MarketModule],
  controllers: [JobsController],
  providers: [JobsService, JobsRunnerService, JobsEventBusService],
  exports: [JobsService],
})
export class JobsModule {}
