import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  MessageEvent,
  Param,
  Post,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import { JobsRunnerService } from './jobs-runner.service.js';
import { JobsService } from './jobs.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { Role } from '@prisma/client';

@Controller('jobs')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Jobs')
@ApiBearerAuth()
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly jobsRunnerService: JobsRunnerService,
  ) {}

  @Post('profiles/:id/analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  async createProfileAnalysisJob(@Param('id') profileId: string, @Req() req: any) {
    const job = await this.jobsService.createJob({
      userId: req.user.id,
      type: 'PROFILE_ANALYSIS',
      payload: { profileId },
    });

    this.jobsRunnerService.runProfileAnalysisJob(job.id, profileId, req.user.id);

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
}
