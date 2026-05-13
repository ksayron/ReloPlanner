import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsService } from '../jobs/jobs.service.js';

type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface DependencyState {
  name: string;
  status: HealthStatus;
  latencyMs: number | null;
  message: string | null;
}

export interface SystemStateResponse {
  generatedAt: Date;
  startedAt: Date;
  status: HealthStatus;
  process: {
    pid: number;
    nodeVersion: string;
    platform: NodeJS.Platform;
    uptimeSeconds: number;
    memory: {
      rssBytes: number;
      heapUsedBytes: number;
      heapTotalBytes: number;
      externalBytes: number;
      arrayBuffersBytes: number;
      heapUsagePercent: number;
    };
  };
  dependencies: DependencyState[];
  queue: {
    pending: number;
    running: number;
    stuck: number;
    oldestPendingCreatedAt: Date | null;
    completedLastHour: number;
    failedLastHour: number;
  };
  warnings: string[];
}

@Injectable()
export class MonitoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async getSystemState(): Promise<SystemStateResponse> {
    const startedAt = Date.now();
    const dbState = await this.getDatabaseState();
    const queueDashboard = await this.jobsService.getQueueDashboard(10);
    const memory = process.memoryUsage();
    const heapUsagePercent =
      memory.heapTotal > 0 ? (memory.heapUsed / memory.heapTotal) * 100 : 0;

    const warnings: string[] = [];
    if (dbState.status !== 'healthy') {
      warnings.push('Database connectivity is degraded');
    }
    if (queueDashboard.queue.stuck > 0) {
      warnings.push(
        `${queueDashboard.queue.stuck} job(s) are running longer than ${queueDashboard.stuckThresholdMinutes} minutes`,
      );
    }
    if (queueDashboard.queue.pending > 25) {
      warnings.push('Job queue backlog is growing (more than 25 pending jobs)');
    }
    if (heapUsagePercent >= 85) {
      warnings.push(
        `High heap utilization detected (${heapUsagePercent.toFixed(1)}%)`,
      );
    }

    let status: HealthStatus = 'healthy';
    if (dbState.status === 'unhealthy') {
      status = 'unhealthy';
    } else if (warnings.length > 0) {
      status = 'degraded';
    }

    return {
      generatedAt: new Date(),
      status,
      startedAt: new Date(startedAt),
      process: {
        pid: process.pid,
        nodeVersion: process.version,
        platform: process.platform,
        uptimeSeconds: Math.floor(process.uptime()),
        memory: {
          rssBytes: memory.rss,
          heapUsedBytes: memory.heapUsed,
          heapTotalBytes: memory.heapTotal,
          externalBytes: memory.external,
          arrayBuffersBytes: memory.arrayBuffers,
          heapUsagePercent: Number(heapUsagePercent.toFixed(2)),
        },
      },
      dependencies: [dbState] as DependencyState[],
      queue: {
        pending: queueDashboard.queue.pending,
        running: queueDashboard.queue.running,
        stuck: queueDashboard.queue.stuck,
        oldestPendingCreatedAt: queueDashboard.queue.oldestPendingCreatedAt,
        completedLastHour: queueDashboard.throughput.completedLastHour,
        failedLastHour: queueDashboard.throughput.failedLastHour,
      },
      warnings,
    };
  }

  private async getDatabaseState(): Promise<DependencyState> {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - started;
      return {
        name: 'postgresql',
        status: latencyMs > 1000 ? 'degraded' : 'healthy',
        latencyMs,
        message: latencyMs > 1000 ? 'High query latency' : null,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - started;
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        name: 'postgresql',
        status: 'unhealthy',
        latencyMs,
        message,
      };
    }
  }
}
