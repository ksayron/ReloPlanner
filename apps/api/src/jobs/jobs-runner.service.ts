import { Injectable } from '@nestjs/common';
import { AnalysisWorkflowService } from '../scoring/analysis-workflow.service.js';
import { JobsEventBusService } from './jobs-event-bus.service.js';
import { MarketSyncService } from '../market/market-sync.service.js';
import { ReportsService } from '../reports/reports.service.js';
import { ReportLocale, ReportVariant } from '../reports/reports.types.js';
import { ResumeTextExtractionResult } from '../resume/resume.types.js';
import { ResumeProfileDraftService } from '../resume/resume-profile-draft.service.js';

@Injectable()
export class JobsRunnerService {
  constructor(
    private readonly analysisWorkflow: AnalysisWorkflowService,
    private readonly jobsEventBus: JobsEventBusService,
    private readonly marketSyncService: MarketSyncService,
    private readonly reportsService: ReportsService,
    private readonly resumeProfileDraftService: ResumeProfileDraftService,
  ) {}

  runProfileAnalysisJob(jobId: string, profileId: string, userId: string) {
    void this.executeProfileAnalysisJob(jobId, profileId, userId);
  }

  runMarketSyncJob(jobId: string) {
    void this.executeMarketSyncJob(jobId);
  }

  runReportGenerationJob(
    jobId: string,
    analysisId: string,
    userId: string,
    variant: ReportVariant,
    format: 'json' | 'html' | 'pdf',
    locale: ReportLocale = 'en',
  ) {
    void this.executeReportGenerationJob(
      jobId,
      analysisId,
      userId,
      variant,
      format,
      locale,
    );
  }

  runResumeProfileParseJob(
    jobId: string,
    userId: string,
    extracted: ResumeTextExtractionResult,
  ) {
    void this.executeResumeProfileParseJob(jobId, userId, extracted);
  }

  private async executeProfileAnalysisJob(
    jobId: string,
    profileId: string,
    userId: string,
  ) {
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
          const progressPercent = Math.max(
            1,
            Math.min(99, Math.round((index / total) * 100)),
          );
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

  private async executeReportGenerationJob(
    jobId: string,
    analysisId: string,
    userId: string,
    variant: ReportVariant,
    format: 'json' | 'html' | 'pdf',
    locale: ReportLocale = 'en',
  ) {
    let lastStep = 'QUEUED';
    let lastProgress = 0;

    this.jobsEventBus.emit({
      type: 'JOB_STARTED',
      jobId,
      step: 'STARTED',
      progressPercent: 1,
    });

    try {
      lastStep = 'BUILDING_SNAPSHOT';
      lastProgress = 35;
      this.jobsEventBus.emit({
        type: 'JOB_PROGRESS',
        jobId,
        step: 'BUILDING_SNAPSHOT',
        progressPercent: 35,
      });

      if (format === 'json') {
        if (variant === 'ai-summary') {
          await this.reportsService.generateAndPersistAiSummary(
            analysisId,
            userId,
          );
        } else {
          await this.reportsService.generateSnapshot(
            analysisId,
            userId,
            variant,
            locale,
          );
        }
      } else if (format === 'html') {
        await this.reportsService.renderHtmlReport(
          analysisId,
          userId,
          variant,
          locale,
        );
      } else {
        await this.reportsService.renderPdfReport(
          analysisId,
          userId,
          variant,
          locale,
        );
      }

      lastStep = 'ARTIFACT_READY';
      lastProgress = 90;
      this.jobsEventBus.emit({
        type: 'JOB_PROGRESS',
        jobId,
        step: 'ARTIFACT_READY',
        progressPercent: 90,
      });

      this.jobsEventBus.emit({
        type: 'JOB_COMPLETED',
        jobId,
        step: 'COMPLETED',
        progressPercent: 100,
        result: {
          analysisId,
          variant,
          format,
          downloadUrl:
            format === 'json'
              ? `/api/reports/analyses/${analysisId}?variant=${variant}&locale=${locale}`
              : `/api/reports/analyses/${analysisId}/${format}?variant=${variant}&locale=${locale}`,
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

  private async executeResumeProfileParseJob(
    jobId: string,
    userId: string,
    extracted: ResumeTextExtractionResult,
  ) {
    let lastStep = 'QUEUED';
    let lastProgress = 0;

    this.jobsEventBus.emit({
      type: 'JOB_STARTED',
      jobId,
      step: 'STARTED',
      progressPercent: 1,
    });

    try {
      lastStep = 'FILE_PARSED';
      lastProgress = 25;
      this.jobsEventBus.emit({
        type: 'JOB_PROGRESS',
        jobId,
        step: 'FILE_PARSED',
        progressPercent: 25,
      });

      lastStep = 'AI_EXTRACTION';
      lastProgress = 55;
      this.jobsEventBus.emit({
        type: 'JOB_PROGRESS',
        jobId,
        step: 'AI_EXTRACTION',
        progressPercent: 55,
      });

      const draft = await this.resumeProfileDraftService.parseToProfileDraft(
        extracted.text,
      );

      lastStep = 'MAPPING_TO_QUESTIONNAIRE';
      lastProgress = 82;
      this.jobsEventBus.emit({
        type: 'JOB_PROGRESS',
        jobId,
        step: 'MAPPING_TO_QUESTIONNAIRE',
        progressPercent: 82,
      });

      this.jobsEventBus.emit({
        type: 'JOB_COMPLETED',
        jobId,
        step: 'COMPLETED',
        progressPercent: 100,
        result: {
          userId,
          extracted: {
            fileName: extracted.fileName,
            format: extracted.format,
            characterCount: extracted.characterCount,
          },
          draft,
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
