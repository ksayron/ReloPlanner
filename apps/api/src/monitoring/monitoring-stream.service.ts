import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { RealtimeAdminSystemSnapshotPayload } from '@reloplanner/shared-contracts';
import { RealtimeService } from '../realtime/realtime.service.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MonitoringService } from './monitoring.service.js';

@Injectable()
export class MonitoringStreamService {
  private readonly logger = new Logger(MonitoringStreamService.name);

  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly jobsService: JobsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  @Interval(10000)
  async pushAdminSystemSnapshot() {
    try {
      const [systemState, queueDashboard] = await Promise.all([
        this.monitoringService.getSystemState(),
        this.jobsService.getQueueDashboard(30),
      ]);

      const payload: RealtimeAdminSystemSnapshotPayload = {
        generatedAt: new Date().toISOString(),
        systemState: systemState as unknown as Record<string, unknown>,
        queueDashboard: queueDashboard,
      };

      this.realtimeService.emitToAdminMonitoring(
        'admin.system.snapshot',
        payload,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to push admin monitoring snapshot: ${String(error)}`,
      );
    }
  }
}
