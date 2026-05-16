import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsEventBusService } from './jobs-event-bus.service.js';
import {
  ProcessingJobDomainEvent,
  ProcessingJobSnapshot,
  ProcessingJobType,
} from './jobs.types.js';
import { ReplaySubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

const JOB_TYPES: ProcessingJobType[] = [
  'PROFILE_ANALYSIS',
  'MARKET_SYNC',
  'REPORT_GENERATION',
  'RESUME_PROFILE_PARSE',
];

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly destroy$ = new Subject<void>();
  private readonly streams = new Map<
    string,
    ReplaySubject<ProcessingJobSnapshot>
  >();
  private eventQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsEventBus: JobsEventBusService,
  ) {}

  onModuleInit() {
    this.jobsEventBus.events$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => this.enqueueEvent(event));
  }

  onModuleDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    for (const stream of this.streams.values()) {
      stream.complete();
    }
    this.streams.clear();
  }

  async createJob(params: {
    userId: string;
    type: ProcessingJobType;
    payload?: Record<string, unknown>;
  }): Promise<ProcessingJobSnapshot> {
    const processingJobModel = (this.prisma as any).processingJob;
    const created = await processingJobModel.create({
      data: {
        userId: params.userId,
        type: params.type as any,
        status: 'PENDING' as any,
        currentStep: 'QUEUED',
        progressPercent: 0,
        payload: (params.payload as any) ?? null,
      },
    });

    const snapshot = this.toSnapshot(created);
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async getJobForUser(
    jobId: string,
    userId: string,
  ): Promise<ProcessingJobSnapshot> {
    const processingJobModel = (this.prisma as any).processingJob;
    const job = await processingJobModel.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new NotFoundException('Processing job not found');
    }

    const snapshot = this.toSnapshot(job);
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async getJobById(jobId: string): Promise<ProcessingJobSnapshot> {
    const processingJobModel = (this.prisma as any).processingJob;
    const job = await processingJobModel.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException('Processing job not found');
    }

    const snapshot = this.toSnapshot(job);
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async getJobRecordById(jobId: string): Promise<any> {
    const processingJobModel = (this.prisma as any).processingJob;
    const job = await processingJobModel.findUnique({
      where: { id: jobId },
    });
    if (!job) {
      throw new NotFoundException('Processing job not found');
    }
    return job;
  }

  observeJob(jobId: string) {
    return this.getOrCreateStream(jobId).asObservable();
  }

  async countRecentJobsForUser(params: {
    userId: string;
    type: ProcessingJobType;
    since: Date;
  }): Promise<number> {
    const processingJobModel = (this.prisma as any).processingJob;
    return processingJobModel.count({
      where: {
        userId: params.userId,
        type: params.type as any,
        createdAt: { gte: params.since },
      },
    });
  }

  async findActiveProfileAnalysisJobForUser(params: {
    userId: string;
    profileId: string;
  }): Promise<ProcessingJobSnapshot | null> {
    return this.findActiveJobForUser({
      userId: params.userId,
      type: 'PROFILE_ANALYSIS',
      payloadKey: 'profileId',
      payloadValue: params.profileId,
    });
  }

  async findActiveJobForUser(params: {
    userId: string;
    type: ProcessingJobType;
    payloadKey?: string;
    payloadValue?: string;
  }): Promise<ProcessingJobSnapshot | null> {
    const processingJobModel = (this.prisma as any).processingJob;
    const payloadFilter =
      params.payloadKey && params.payloadValue
        ? {
            payload: {
              path: [params.payloadKey],
              equals: params.payloadValue,
            },
          }
        : {};

    const job = await processingJobModel.findFirst({
      where: {
        userId: params.userId,
        type: params.type as any,
        status: {
          in: ['PENDING', 'RUNNING'],
        },
        ...payloadFilter,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!job) return null;
    const snapshot = this.toSnapshot(job);
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async getQueueDashboard(limit: number): Promise<{
    generatedAt: Date;
    stuckThresholdMinutes: number;
    totals: {
      all: number;
      pending: number;
      running: number;
      completedLast24h: number;
      failedLast24h: number;
    };
    throughput: {
      completedLastHour: number;
      failedLastHour: number;
      completedLast24h: number;
      failedLast24h: number;
    };
    queue: {
      pending: number;
      running: number;
      stuck: number;
      oldestPendingCreatedAt: Date | null;
    };
    byType: Array<{
      type: ProcessingJobType;
      pending: number;
      running: number;
      completedLast24h: number;
      failedLast24h: number;
      total: number;
    }>;
    active: Array<
      ProcessingJobSnapshot & {
        runSeconds: number | null;
        isPossiblyStuck: boolean;
      }
    >;
    recent: Array<
      ProcessingJobSnapshot & {
        durationSeconds: number | null;
        ageSeconds: number;
        isRetryable: boolean;
      }
    >;
  }> {
    const now = Date.now();
    const oneHourAgo = new Date(now - 60 * 60 * 1000);
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const stuckThresholdMinutes = 30;
    const stuckThresholdDate = new Date(
      now - stuckThresholdMinutes * 60 * 1000,
    );
    const safeLimit = Math.min(Math.max(limit, 5), 100);
    const processingJobModel = (this.prisma as any).processingJob;

    const [
      allCount,
      pendingCount,
      runningCount,
      completedLast24h,
      failedLast24h,
      completedLastHour,
      failedLastHour,
      activeRows,
      recentRows,
      oldestPending,
      stuckCount,
    ] = await Promise.all([
      processingJobModel.count(),
      processingJobModel.count({ where: { status: 'PENDING' as any } }),
      processingJobModel.count({ where: { status: 'RUNNING' as any } }),
      processingJobModel.count({
        where: { status: 'COMPLETED' as any, updatedAt: { gte: oneDayAgo } },
      }),
      processingJobModel.count({
        where: { status: 'FAILED' as any, updatedAt: { gte: oneDayAgo } },
      }),
      processingJobModel.count({
        where: { status: 'COMPLETED' as any, updatedAt: { gte: oneHourAgo } },
      }),
      processingJobModel.count({
        where: { status: 'FAILED' as any, updatedAt: { gte: oneHourAgo } },
      }),
      processingJobModel.findMany({
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
        take: 50,
      }),
      processingJobModel.findMany({
        orderBy: { createdAt: 'desc' },
        take: safeLimit,
      }),
      processingJobModel.findFirst({
        where: { status: 'PENDING' as any },
        orderBy: { createdAt: 'asc' },
      }),
      processingJobModel.count({
        where: {
          status: 'RUNNING' as any,
          startedAt: { lte: stuckThresholdDate },
        },
      }),
    ]);

    const byType = await Promise.all(
      JOB_TYPES.map(async (type) => {
        const [pending, running, completed24h, failed24h, total] =
          await Promise.all([
            processingJobModel.count({
              where: { type: type as any, status: 'PENDING' as any },
            }),
            processingJobModel.count({
              where: { type: type as any, status: 'RUNNING' as any },
            }),
            processingJobModel.count({
              where: {
                type: type as any,
                status: 'COMPLETED' as any,
                updatedAt: { gte: oneDayAgo },
              },
            }),
            processingJobModel.count({
              where: {
                type: type as any,
                status: 'FAILED' as any,
                updatedAt: { gte: oneDayAgo },
              },
            }),
            processingJobModel.count({ where: { type: type as any } }),
          ]);
        return {
          type,
          pending,
          running,
          completedLast24h: completed24h,
          failedLast24h: failed24h,
          total,
        };
      }),
    );

    return {
      generatedAt: new Date(now),
      stuckThresholdMinutes,
      totals: {
        all: allCount,
        pending: pendingCount,
        running: runningCount,
        completedLast24h,
        failedLast24h,
      },
      throughput: {
        completedLastHour,
        failedLastHour,
        completedLast24h,
        failedLast24h,
      },
      queue: {
        pending: pendingCount,
        running: runningCount,
        stuck: stuckCount,
        oldestPendingCreatedAt: oldestPending?.createdAt ?? null,
      },
      byType,
      active: activeRows.map((row: any) => {
        const snapshot = this.toSnapshot(row);
        const startedAt = snapshot.startedAt ?? snapshot.createdAt;
        const runSeconds = startedAt
          ? Math.max(
              0,
              Math.floor((now - new Date(startedAt).getTime()) / 1000),
            )
          : null;
        return {
          ...snapshot,
          runSeconds,
          isPossiblyStuck:
            snapshot.status === 'RUNNING' &&
            snapshot.startedAt != null &&
            new Date(snapshot.startedAt).getTime() <=
              stuckThresholdDate.getTime(),
        };
      }),
      recent: recentRows.map((row: any) => {
        const snapshot = this.toSnapshot(row);
        const start = snapshot.startedAt ?? snapshot.createdAt;
        const end = snapshot.completedAt ?? snapshot.updatedAt;
        const durationSeconds =
          start && end
            ? Math.max(
                0,
                Math.floor(
                  (new Date(end).getTime() - new Date(start).getTime()) / 1000,
                ),
              )
            : null;
        return {
          ...snapshot,
          durationSeconds,
          ageSeconds: Math.max(
            0,
            Math.floor((now - new Date(snapshot.createdAt).getTime()) / 1000),
          ),
          isRetryable:
            snapshot.status === 'FAILED' &&
            (snapshot.type === 'PROFILE_ANALYSIS' ||
              snapshot.type === 'MARKET_SYNC' ||
              snapshot.type === 'REPORT_GENERATION'),
        };
      }),
    };
  }

  private enqueueEvent(event: ProcessingJobDomainEvent) {
    this.eventQueue = this.eventQueue
      .then(() => this.applyDomainEvent(event))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to apply job domain event: ${message}`);
      });
  }

  private async applyDomainEvent(event: ProcessingJobDomainEvent) {
    const processingJobModel = (this.prisma as any).processingJob;
    const existing = await processingJobModel.findUnique({
      where: { id: event.jobId },
    });
    if (!existing) return;

    const sharedData = {
      currentStep: event.step,
      progressPercent: event.progressPercent,
    };

    let updated;
    if (event.type === 'JOB_STARTED') {
      updated = await processingJobModel.update({
        where: { id: event.jobId },
        data: {
          ...sharedData,
          status: 'RUNNING' as any,
          startedAt: existing.startedAt ?? new Date(),
          errorMessage: null,
        },
      });
    } else if (event.type === 'JOB_PROGRESS') {
      updated = await processingJobModel.update({
        where: { id: event.jobId },
        data: {
          ...sharedData,
          status: 'RUNNING' as any,
        },
      });
    } else if (event.type === 'JOB_COMPLETED') {
      updated = await processingJobModel.update({
        where: { id: event.jobId },
        data: {
          ...sharedData,
          status: 'COMPLETED' as any,
          completedAt: new Date(),
          result: (event.result as any) ?? null,
          errorMessage: null,
        },
      });
    } else if (event.type === 'JOB_FAILED') {
      updated = await processingJobModel.update({
        where: { id: event.jobId },
        data: {
          ...sharedData,
          status: 'FAILED' as any,
          completedAt: new Date(),
          errorMessage: event.errorMessage,
        },
      });
    } else {
      return;
    }

    this.publishSnapshot(this.toSnapshot(updated));
  }

  private toSnapshot(job: any): ProcessingJobSnapshot {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      currentStep: job.currentStep,
      progressPercent: job.progressPercent,
      errorMessage: job.errorMessage ?? null,
      payload: this.asRecord(job.payload),
      result: this.asRecord(job.result),
      startedAt: job.startedAt ?? null,
      completedAt: job.completedAt ?? null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    return value as Record<string, unknown>;
  }

  private publishSnapshot(snapshot: ProcessingJobSnapshot) {
    this.getOrCreateStream(snapshot.id).next(snapshot);
  }

  private getOrCreateStream(
    jobId: string,
  ): ReplaySubject<ProcessingJobSnapshot> {
    let stream = this.streams.get(jobId);
    if (!stream) {
      stream = new ReplaySubject<ProcessingJobSnapshot>(1);
      this.streams.set(jobId, stream);
    }
    return stream;
  }
}
