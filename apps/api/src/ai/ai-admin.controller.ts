import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../auth/roles.guard.js';
import { AiRoutingService } from './ai-routing.service.js';
import {
  AiProviderName,
  AiTaskGrade,
  isAiProviderName,
  isAiTaskGrade,
} from './ai.types.js';

@Controller('admin/ai')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('Admin AI')
@ApiBearerAuth()
export class AiAdminController {
  constructor(private readonly routing: AiRoutingService) {}

  @Get('routing-policy')
  getRoutingPolicy() {
    return this.routing.getPolicy();
  }

  @Post('routing-policy/:grade/:provider')
  setRoutingPolicy(
    @Param('grade') gradeRaw: string,
    @Param('provider') providerRaw: string,
  ) {
    const grade = gradeRaw.toUpperCase();
    const provider = providerRaw.toUpperCase();
    if (!isAiTaskGrade(grade)) {
      throw new BadRequestException(`Unknown AI task grade: ${gradeRaw}`);
    }
    if (!isAiProviderName(provider)) {
      throw new BadRequestException(`Unknown AI provider: ${providerRaw}`);
    }
    return this.routing.setDefaultProvider(grade, provider);
  }
}
