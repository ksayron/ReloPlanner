import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { EvaluateLegalReadinessDto } from './legal-readiness.dto.js';
import { LegalReadinessService } from './legal-readiness.service.js';

@Controller('legal-readiness')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Legal Readiness')
@ApiBearerAuth()
export class LegalReadinessController {
  constructor(private readonly legalReadiness: LegalReadinessService) {}

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateLegalReadinessDto) {
    return this.legalReadiness.evaluate(dto);
  }
}

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Legal Readiness')
@ApiBearerAuth()
export class ProfileLegalReadinessController {
  constructor(private readonly legalReadiness: LegalReadinessService) {}

  @Get(':profileId/legal-readiness')
  evaluateForProfile(
    @Param('profileId') profileId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.legalReadiness.evaluateForProfile(
      profileId,
      req.user?.id ?? '',
    );
  }
}
