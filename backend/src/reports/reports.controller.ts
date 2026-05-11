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
import { ReportLocale, ReportVariant } from './reports.types.js';

@Controller('reports')
@UseGuards(AuthGuard('jwt'))
@ApiTags('Reports')
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private resolveVariant(raw?: string): ReportVariant {
    return raw === 'ai-summary' ? 'ai-summary' : 'snapshot';
  }

  private resolveLocale(raw?: string): ReportLocale {
    return raw === 'ru' ? 'ru' : 'en';
  }

  @Get('analyses/:analysisId')
  async getSnapshot(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
    @Query('locale') localeRaw?: string,
  ) {
    return this.reportsService.generateSnapshot(
      analysisId,
      req.user.id,
      this.resolveVariant(variantRaw),
      this.resolveLocale(localeRaw),
    );
  }

  @Get('analyses/:analysisId/html')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getHtml(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
    @Query('locale') localeRaw?: string,
  ) {
    const report = await this.reportsService.renderHtmlReport(
      analysisId,
      req.user.id,
      this.resolveVariant(variantRaw),
      this.resolveLocale(localeRaw),
    );
    return report.html;
  }

  @Get('analyses/:analysisId/pdf')
  async getPdf(
    @Param('analysisId') analysisId: string,
    @Req() req: any,
    @Query('variant') variantRaw?: string,
    @Query('locale') localeRaw?: string,
  ): Promise<StreamableFile> {
    const variant = this.resolveVariant(variantRaw);
    const locale = this.resolveLocale(localeRaw);
    const report = await this.reportsService.renderPdfReport(analysisId, req.user.id, variant, locale);
    return new StreamableFile(report.pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="relocation-readiness-${analysisId}-${variant}-${locale}.pdf"`,
      length: report.pdf.length,
    });
  }
}
