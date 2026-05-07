import { Injectable } from '@nestjs/common';
import { AnalysisWorkflowService } from '../scoring/analysis-workflow.service.js';
import { JobsEventBusService } from './jobs-event-bus.service.js';
import { MarketSyncService } from '../market/market-sync.service.js';

@Injectable()
export class JobsRunnerService {
  constructor(
    private readonly analysisWorkflow: AnalysisWorkflowService,
    private readonly jobsEventBus: JobsEventBusService,
    private readonly marketSyncService: MarketSyncService,
  ) {}

  runProfileAnalysisJob(jobId: string, profileId: string, userId: string) {
    void this.executeProfileAnalysisJob(jobId, profileId, userId);
  }

  runMarketSyncJob(jobId: string) {
    void this.executeMarketSyncJob(jobId);
  }

  private async executeProfileAnalysisJob(jobId: string, profileId: string, userId: string) {
    let lastStep = 'QUEUED';
    let lastProgress = 0;

    this.jobsEventBus.emit({
      type: 'JOB_STARTED',
      jobId,
      step: 'STARTED',
      progressPercent: 1,
    });

    try {
      const analysis = await this.analysisWorkflow.executeAnalysis(
        profileId,
        userId,
        async ({ step, progressPercent }) => {
          lastStep = step;
          lastProgress = progressPercent;
          this.jobsEventBus.emit({
            type: 'JOB_PROGRESS',
            jobId,
            step,
            progressPercent,
          });
        },
      );

      this.jobsEventBus.emit({
        type: 'JOB_COMPLETED',
        jobId,
        step: 'COMPLETED',
        progressPercent: 100,
        result: {
          analysisId: analysis.id,
          fitScore: analysis.fitScore,
          totalPrepMonths: analysis.totalPrepMonths,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.jobsEventBus.emit({
        type: 'JOB_FAILED',
        jobId,
        step: lastStep,
        progressPercent: lastProgress,
        errorMessage: message,
      });
    }
  }

  private async executeMarketSyncJob(jobId: string) {
    let lastStep = 'QUEUED';
    let lastProgress = 0;

    this.jobsEventBus.emit({
      type: 'JOB_STARTED',
      jobId,
      step: 'STARTED',
      progressPercent: 1,
    });

    try {
      const results = await this.marketSyncService.syncAll('manual', {
        force: true,
        onProgress: ({ country, index, total, result }) => {
          const progressPercent = Math.max(1, Math.min(99, Math.round((index / total) * 100)));
          const step = result
            ? `COUNTRY_DONE:${country}:${result.status}`
            : `SYNCING_COUNTRY:${country}`;

          lastStep = step;
          lastProgress = progressPercent;

          this.jobsEventBus.emit({
            type: 'JOB_PROGRESS',
            jobId,
            step,
            progressPercent,
          });
        },
      });

      const synced = results.filter((r) => r.status === 'synced').length;
      const skipped = results.filter((r) => r.status === 'skipped').length;
      const errors = results.filter((r) => r.status === 'error').length;

      this.jobsEventBus.emit({
        type: 'JOB_COMPLETED',
        jobId,
        step: 'COMPLETED',
        progressPercent: 100,
        result: {
          synced,
          skipped,
          errors,
          total: results.length,
          results,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.jobsEventBus.emit({
        type: 'JOB_FAILED',
        jobId,
        step: lastStep,
        progressPercent: lastProgress,
        errorMessage: message,
      });
    }
  }
}
