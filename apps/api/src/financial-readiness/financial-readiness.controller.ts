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
import { EvaluateFinancialReadinessDto } from './financial-readiness.dto.js';
import { FinancialReadinessService } from './financial-readiness.service.js';

@Controller('financial-readiness')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Financial Readiness')
@ApiBearerAuth()
export class FinancialReadinessController {
  constructor(private readonly financialReadiness: FinancialReadinessService) {}

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateFinancialReadinessDto) {
    return this.financialReadiness.evaluate(dto);
  }
}

@Controller('profiles')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Financial Readiness')
@ApiBearerAuth()
export class ProfileFinancialReadinessController {
  constructor(private readonly financialReadiness: FinancialReadinessService) {}

  @Get(':profileId/financial-readiness')
  evaluateForProfile(
    @Param('profileId') profileId: string,
    @Req() req: { user?: { id?: string } },
  ) {
    return this.financialReadiness.evaluateForProfile(
      profileId,
      req.user?.id ?? '',
    );
  }
}
