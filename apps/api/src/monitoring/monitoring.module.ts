import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringService } from './monitoring.service.js';
import { MonitoringStreamService } from './monitoring-stream.service.js';

@Module({
  imports: [PrismaModule, JobsModule, RealtimeModule],
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringStreamService],
})
export class MonitoringModule {}
