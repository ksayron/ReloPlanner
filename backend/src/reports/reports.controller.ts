import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ReportsService } from './reports.service.js';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportVariant } from './reports.types.js';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Reports')
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private resolveVariant(raw?: string): ReportVariant {
    return raw === 'ai-summary' ? 'ai-summary' : 'snapshot';
  }

  @Get('analyses/:analysisId')
  async getSnapshot(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
  ) {
    return this.reportsService.generateSnapshot(
      analysisId,
      req.user.id,
      this.resolveVariant(variantRaw),
    );
  }

  @Get('analyses/:analysisId/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getHtml(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
  ) {
    const report = await this.reportsService.renderHtmlReport(
      analysisId,
      req.user.id,
      this.resolveVariant(variantRaw),
    );
    return report.html;
  }

  @Get('analyses/:analysisId/pdf')
  async getPdf(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
  ): Promise<StreamableFile> {
    const variant = this.resolveVariant(variantRaw);
    const report = await this.reportsService.renderPdfReport(analysisId, req.user.id, variant);
    return new StreamableFile(report.pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="relocation-readiness-${analysisId}-${variant}.pdf"`,
      length: report.pdf.length,
    });
  }
}
