import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { JobsRunnerService } from './jobs-runner.service.js';
import { JobsService } from './jobs.service.js';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { Role } from '@prisma/client';
import { ReportLocale, ReportVariant } from '../reports/reports.types.js';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { ResumeTextExtractionService } from '../resume/resume-text-extraction.service.js';
import { EntitlementService } from '../billing/entitlement.service.js';
import { FEATURE_CODES } from '../billing/billing.constants.js';

@Controller('jobs')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Jobs')
@ApiBearerAuth()
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobsRunnerService: JobsRunnerService,
    private readonly resumeTextExtractionService: ResumeTextExtractionService,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Post('profiles/:id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async createProfileAnalysisJob(
    @Param('id') profileId: string,
    @Req() req: any,
  ) {
    const job = await this.jobsService.createJob({
      userId: req.user.id,
      type: 'PROFILE_ANALYSIS',
      payload: { profileId },
    });

    this.jobsRunnerService.runProfileAnalysisJob(
      job.id,
      profileId,
      req.user.id,
    );

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      currentStep: job.currentStep,
      progressPercent: job.progressPercent,
      eventsUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
    };
  }

  @Post('market/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async createMarketSyncJob(@Req() req: any) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await this.jobsService.countRecentJobsForUser({
      userId: req.user.id,
      type: 'MARKET_SYNC',
      since: oneHourAgo,
    });

    if (recentCount >= 5) {
      throw new HttpException(
        'Manual market sync is limited to 5 runs per hour',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const job = await this.jobsService.createJob({
      userId: req.user.id,
      type: 'MARKET_SYNC',
      payload: { force: true },
    });

    this.jobsRunnerService.runMarketSyncJob(job.id);

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      currentStep: job.currentStep,
      progressPercent: job.progressPercent,
      eventsUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
      rateLimit: {
        windowMinutes: 60,
        maxRuns: 5,
        usedRuns: recentCount + 1,
      },
    };
  }

  @Get('profiles/:id/active-analysis')
  async getActiveProfileAnalysisJob(
    @Param('id') profileId: string,
    @Req() req: any,
  ) {
    return this.jobsService.findActiveProfileAnalysisJobForUser({
      userId: req.user.id,
      profileId,
    });
  }

  @Post('reports/analyses/:analysisId/generate')
  @HttpCode(HttpStatus.ACCEPTED)
  async createReportGenerationJob(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
    @Query('format') formatRaw?: string,
    @Query('locale') localeRaw?: string,
  ) {
    const variant: ReportVariant =
      variantRaw === 'ai-summary' ? 'ai-summary' : 'snapshot';
    const format =
      formatRaw === 'pdf' || formatRaw === 'html' ? formatRaw : 'json';
    const locale: ReportLocale = localeRaw === 'ru' ? 'ru' : 'en';

    if (variant === 'ai-summary') {
      await this.entitlementService.assertFeatureAccess(
        req.user.id,
        FEATURE_CODES.AI_DETAILED_REPORT,
      );
    }
    if (format === 'pdf') {
      await this.entitlementService.assertFeatureAccess(
        req.user.id,
        FEATURE_CODES.PDF_EXPORT,
      );
    }

    const job = await this.jobsService.createJob({
      userId: req.user.id,
      type: 'REPORT_GENERATION',
      payload: { analysisId, variant, format, locale },
    });

    this.jobsRunnerService.runReportGenerationJob(
      job.id,
      analysisId,
      req.user.id,
      variant,
      format,
      locale,
    );

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      currentStep: job.currentStep,
      progressPercent: job.progressPercent,
      eventsUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
    };
  }

  @Post('resume/parse-profile')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  async createResumeProfileParseJob(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const extracted =
      await this.resumeTextExtractionService.extractFromUpload(file);
    const job = await this.jobsService.createJob({
      userId: req.user.id,
      type: 'RESUME_PROFILE_PARSE',
      payload: {
        fileName: extracted.fileName,
        format: extracted.format,
        characterCount: extracted.characterCount,
      },
    });

    this.jobsRunnerService.runResumeProfileParseJob(
      job.id,
      req.user.id,
      extracted,
    );

    return {
      jobId: job.id,
      type: job.type,
      status: job.status,
      currentStep: job.currentStep,
      progressPercent: job.progressPercent,
      eventsUrl: `/api/jobs/${job.id}/events`,
      statusUrl: `/api/jobs/${job.id}`,
    };
  }

  @Get('active')
  async getActiveJob(
    @Req() req: any,
    @Query('type') type: string,
    @Query('payloadKey') payloadKey?: string,
    @Query('payloadValue') payloadValue?: string,
  ) {
    if (
      type !== 'PROFILE_ANALYSIS' &&
      type !== 'MARKET_SYNC' &&
      type !== 'REPORT_GENERATION' &&
      type !== 'RESUME_PROFILE_PARSE'
    ) {
      throw new BadRequestException('Invalid job type');
    }
    return this.jobsService.findActiveJobForUser({
      userId: req.user.id,
      type,
      payloadKey,
      payloadValue,
    });
  }

  @Get('admin/queue/dashboard')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminQueueDashboard(@Query('limit') limitRaw?: string) {
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 25;
    return this.jobsService.getQueueDashboard(limit);
  }

  @Post('admin/queue/:jobId/retry')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  async retryJob(@Param('jobId') jobId: string) {
    const sourceJob = await this.jobsService.getJobRecordById(jobId);
    const sourcePayload = this.asRecord(sourceJob.payload);

    if (sourceJob.type === 'PROFILE_ANALYSIS') {
      const profileId = this.asString(sourcePayload?.profileId);
      if (!profileId) {
        throw new BadRequestException(
          'Cannot retry PROFILE_ANALYSIS job: missing profileId in payload',
        );
      }
      const retryJob = await this.jobsService.createJob({
        userId: sourceJob.userId,
        type: 'PROFILE_ANALYSIS',
        payload: { profileId },
      });
      this.jobsRunnerService.runProfileAnalysisJob(
        retryJob.id,
        profileId,
        sourceJob.userId,
      );
      return {
        sourceJobId: sourceJob.id,
        retryJobId: retryJob.id,
        retryType: retryJob.type,
        statusUrl: `/api/jobs/${retryJob.id}`,
        eventsUrl: `/api/jobs/${retryJob.id}/events`,
      };
    }

    if (sourceJob.type === 'MARKET_SYNC') {
      const retryJob = await this.jobsService.createJob({
        userId: sourceJob.userId,
        type: 'MARKET_SYNC',
        payload: { force: true, retriedFromJobId: sourceJob.id },
      });
      this.jobsRunnerService.runMarketSyncJob(retryJob.id);
      return {
        sourceJobId: sourceJob.id,
        retryJobId: retryJob.id,
        retryType: retryJob.type,
        statusUrl: `/api/jobs/${retryJob.id}`,
        eventsUrl: `/api/jobs/${retryJob.id}/events`,
      };
    }

    if (sourceJob.type === 'REPORT_GENERATION') {
      const analysisId = this.asString(sourcePayload?.analysisId);
      const variant = sourcePayload?.variant;
      const format = sourcePayload?.format;
      const locale = sourcePayload?.locale;

      if (!analysisId) {
        throw new BadRequestException(
          'Cannot retry REPORT_GENERATION job: missing analysisId in payload',
        );
      }
      if (variant !== 'snapshot' && variant !== 'ai-summary') {
        throw new BadRequestException(
          'Cannot retry REPORT_GENERATION job: invalid variant in payload',
        );
      }
      if (format !== 'json' && format !== 'html' && format !== 'pdf') {
        throw new BadRequestException(
          'Cannot retry REPORT_GENERATION job: invalid format in payload',
        );
      }
      if (locale !== 'en' && locale !== 'ru') {
        throw new BadRequestException(
          'Cannot retry REPORT_GENERATION job: invalid locale in payload',
        );
      }

      const retryJob = await this.jobsService.createJob({
        userId: sourceJob.userId,
        type: 'REPORT_GENERATION',
        payload: {
          analysisId,
          variant,
          format,
          locale,
          retriedFromJobId: sourceJob.id,
        },
      });
      this.jobsRunnerService.runReportGenerationJob(
        retryJob.id,
        analysisId,
        sourceJob.userId,
        variant,
        format,
        locale,
      );
      return {
        sourceJobId: sourceJob.id,
        retryJobId: retryJob.id,
        retryType: retryJob.type,
        statusUrl: `/api/jobs/${retryJob.id}`,
        eventsUrl: `/api/jobs/${retryJob.id}/events`,
      };
    }

    throw new BadRequestException(
      `Retry is not supported for job type ${sourceJob.type}. Please trigger it from the original flow.`,
    );
  }

  @Get(':jobId')
  async getJob(@Param('jobId') jobId: string, @Req() req: any) {
    return this.jobsService.getJobForUser(jobId, req.user.id);
  }

  @Sse(':jobId/events')
  async streamJobEvents(
    @Param('jobId') jobId: string,
    @Req() req: any,
  ): Promise<Observable<MessageEvent>> {
    const initial = await this.jobsService.getJobForUser(jobId, req.user.id);

    return this.jobsService.observeJob(jobId).pipe(
      startWith(initial),
      map((snapshot) => ({
        type: 'job.update',
        data: snapshot,
      })),
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
