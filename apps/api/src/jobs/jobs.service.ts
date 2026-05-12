import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { JobsEventBusService } from './jobs-event-bus.service.js';
import {
  ProcessingJobDomainEvent,
  ProcessingJobSnapshot,
  ProcessingJobType,
} from './jobs.types.js';
import { ReplaySubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly destroy$ = new Subject<void>();
  private readonly streams = new Map<string, ReplaySubject<ProcessingJobSnapshot>>();
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

  async getJobForUser(jobId: string, userId: string): Promise<ProcessingJobSnapshot> {
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  }

  private publishSnapshot(snapshot: ProcessingJobSnapshot) {
    this.getOrCreateStream(snapshot.id).next(snapshot);
  }

  private getOrCreateStream(jobId: string): ReplaySubject<ProcessingJobSnapshot> {
    let stream = this.streams.get(jobId);
    if (!stream) {
      stream = new ReplaySubject<ProcessingJobSnapshot>(1);
      this.streams.set(jobId, stream);
    }
    return stream;
  }
}
