import {
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Express } from 'express';
import { EntitlementService } from '../billing/entitlement.service.js';
import { FEATURE_CODES } from '../billing/billing.constants.js';
import { ResumeTextExtractionService } from './resume-text-extraction.service.js';

@Controller('resume')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Resume')
@ApiBearerAuth()
export class ResumeController {
  constructor(
    private readonly resumeTextExtractionService: ResumeTextExtractionService,
    private readonly entitlementService: EntitlementService,
  ) {}

  @Post('extract-text')
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
  extractText(@UploadedFile() file: Express.Multer.File) {
    return this.resumeTextExtractionService.extractFromUpload(file);
  }

  @Post('recommendations/target-market')
  async generateTargetMarketRecommendations(@Req() req: any) {
    await this.entitlementService.assertFeatureAccess(
      req.user.id,
      FEATURE_CODES.AI_CV_RECOMMENDATIONS,
    );

    throw new HttpException(
      {
        code: 'IN_DEVELOPMENT',
        message: 'Target-market CV recommendations are in development.',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  @Post('recommendations/job-specific')
  async generateJobSpecificRecommendations(@Req() req: any) {
    await this.entitlementService.assertFeatureAccess(
      req.user.id,
      FEATURE_CODES.AI_CV_RECOMMENDATIONS,
    );

    throw new HttpException(
      {
        code: 'IN_DEVELOPMENT',
        message: 'Job-specific CV recommendations are in development.',
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
