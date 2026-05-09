import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import type { Express } from 'express';
import { ResumeTextExtractionService } from './resume-text-extraction.service.js';

@Controller('resume')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Resume')
@ApiBearerAuth()
export class ResumeController {
  constructor(
    private readonly resumeTextExtractionService: ResumeTextExtractionService,
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
}
