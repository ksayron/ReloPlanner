import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { JobsService } from '../jobs/jobs.service.js';
import { MonitoringService } from './monitoring.service.js';

@Controller('admin/system')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('Admin Monitoring')
@ApiBearerAuth()
export class MonitoringController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly jobsService: JobsService,
  ) {}

  @Get('state')
  getSystemState() {
    return this.monitoringService.getSystemState();
  }

  @Get('queue')
  getQueueDashboard(@Query('limit') limitRaw?: string) {
    const parsedLimit = Number(limitRaw);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 25;
    return this.jobsService.getQueueDashboard(limit);
  }
}
