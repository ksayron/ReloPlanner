import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { ScoringTuningService } from './scoring-tuning.service.js';

@Controller('admin/scoring')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('Admin Scoring')
@ApiBearerAuth()
export class ScoringAdminController {
  constructor(private readonly scoringTuning: ScoringTuningService) {}

  @Get('tuning-profiles')
  getTuningProfiles() {
    return {
      activeProfile: this.scoringTuning.getActiveProfile(),
      profiles: this.scoringTuning.listProfiles(),
    };
  }

  @Post('tuning-profile/:name')
  setTuningProfile(@Param('name') name: string) {
    return this.scoringTuning.setActiveProfile(name);
  }
}
