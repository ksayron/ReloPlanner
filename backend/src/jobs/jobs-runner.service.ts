import { Injectable } from '@nestjs/common';
import { AnalysisWorkflowService } from '../scoring/analysis-workflow.service.js';
import { JobsEventBusService } from './jobs-event-bus.service.js';

@Injectable()
export class JobsRunnerService {
  constructor(
    private readonly analysisWorkflow: AnalysisWorkflowService,
    private readonly jobsEventBus: JobsEventBusService,
  ) {}

  runProfileAnalysisJob(jobId: string, profileId: string, userId: string) {
    void this.executeProfileAnalysisJob(jobId, profileId, userId);
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
}
