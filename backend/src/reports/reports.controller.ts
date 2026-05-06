import {
  Controller,
  Get,
  Header,
  Param,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('analyses/:analysisId')
  async getSnapshot(@Param('analysisId') analysisId: string, @Req() req: any) {
    return this.reportsService.generateSnapshot(analysisId, req.user.id);
  }

  @Get('analyses/:analysisId/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getHtml(@Param('analysisId') analysisId: string, @Req() req: any) {
    const report = await this.reportsService.renderHtmlReport(analysisId, req.user.id);
    return report.html;
  }

  @Get('analyses/:analysisId/pdf')
  async getPdf(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
  ): Promise<StreamableFile> {
    const report = await this.reportsService.renderPdfReport(analysisId, req.user.id);
    return new StreamableFile(report.pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="relocation-readiness-${analysisId}.pdf"`,
      length: report.pdf.length,
    });
  }
}

