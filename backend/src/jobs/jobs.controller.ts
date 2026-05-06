import {
  Controller,
  Get,
  HttpCode,
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
