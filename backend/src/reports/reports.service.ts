import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RelocationReadinessReportSnapshot,
  ReportGapItem,
  ReportGenerationMeta,
  ReportSkillBreakdownItem,
} from './reports.types.js';
import { JSDOM } from 'jsdom';
import htmlToPdfmake from 'html-to-pdfmake';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateSnapshot(analysisId: string, userId: string): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
  }> {
    const generation = this.createGenerationMeta();

    try {
      generation.status = 'GENERATING';
      const analysis = await this.loadAnalysis(analysisId, userId);
      const snapshot = this.buildSnapshot(analysis);
      generation.status = 'COMPLETED';
      generation.completedAt = new Date();
      return { generation, snapshot };
    } catch (error: unknown) {
      generation.status = 'FAILED';
      generation.completedAt = new Date();
      generation.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async renderHtmlReport(analysisId: string, userId: string): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    html: string;
  }> {
    const { generation, snapshot } = await this.generateSnapshot(analysisId, userId);
    const html = this.renderHtml(snapshot);
    return { generation, snapshot, html };
  }

  async renderPdfReport(analysisId: string, userId: string): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    html: string;
    pdf: Buffer;
  }> {
    const { generation, snapshot, html } = await this.renderHtmlReport(analysisId, userId);
    const pdf = await this.renderPdfFromHtml(html);
    return { generation, snapshot, html, pdf };
  }

  private createGenerationMeta(): ReportGenerationMeta {
    return {
      status: 'PENDING',
      startedAt: new Date(),
      completedAt: null,
      error: null,
    };
  }

  private async loadAnalysis(analysisId: string, userId: string) {
    const analysis = await this.prisma.analysisResult.findFirst({
      where: {
        id: analysisId,
        profile: {
          userId,
        },
      },
      include: {
        profile: true,
        snapshot: true,
        analysisItems: {
          include: { competency: true },
        },
        roadmapSteps: {
          include: { competency: true },
          orderBy: { orderIndex: 'asc' },
        },
      },
    });

    if (!analysis) {
      throw new NotFoundException('Analysis result not found');
    }

    return analysis;
  }

  private buildSnapshot(analysis: any): RelocationReadinessReportSnapshot {
    const fitScore = Number(analysis.fitScore);
    const totalPrepMonths = Number(analysis.totalPrepMonths);
    const skillBreakdownRaw = Array.isArray(analysis.skillBreakdown)
      ? analysis.skillBreakdown
      : [];

    const skillBreakdown: ReportSkillBreakdownItem[] = skillBreakdownRaw.map((item: any) => ({
      competencyId: String(item.competencyId ?? ''),
      competencyName: String(item.competencyName ?? ''),
      matchScore: Number(item.matchScore ?? 0),
      weight: Number(item.weight ?? 0),
      recommendationType: String(item.recommendationType ?? 'MARKET_CONTEXT'),
      reason: String(item.reason ?? ''),
    }));

    const detectedGaps: ReportGapItem[] = analysis.analysisItems
      .filter((item: any) => item.recommendationType === 'ACTIONABLE_GAP')
      .map((item: any) => {
        const matchScore = Number(item.matchScore);
        return {
          competencyId: item.competencyId,
          competencyName: item.competency.name,
          currentLevel: item.currentDisplayLevel,
          requiredLevel: item.requiredDisplayLevel,
          matchScore,
          priority: item.priority,
          roleRelevance: item.roleRelevance,
          severity: this.classifyGapSeverity(matchScore, item.priority),
          reason: item.reason,
        };
      })
      .sort((a: ReportGapItem, b: ReportGapItem) => a.matchScore - b.matchScore);

    const timeEstimate =
      analysis.timeEstimate && typeof analysis.timeEstimate === 'object'
        ? {
            optimisticHours: Number((analysis.timeEstimate as any).optimisticHours ?? 0),
            realisticHours: Number((analysis.timeEstimate as any).realisticHours ?? 0),
            criticalPathHours: Number((analysis.timeEstimate as any).criticalPathHours ?? 0),
          }
        : null;

    const topGapNames = detectedGaps.slice(0, 3).map((gap) => gap.competencyName);
    const gapText =
      topGapNames.length > 0 ? `Top gaps: ${topGapNames.join(', ')}` : 'No major gaps detected.';

    return {
      reportType: 'RELOCATION_READINESS_REPORT',
      analysisId: analysis.id,
      generatedAt: new Date(),
      profileSummary: {
        profileId: analysis.profile.id,
        targetCountry: analysis.profile.targetCountry,
        targetCity: analysis.profile.targetCity,
        currentCountry: analysis.profile.currentCountry,
        yearsExperience: analysis.profile.yearsExperience,
        desiredRole: analysis.profile.desiredRole,
      },
      readiness: {
        fitScore,
        readinessLevel: this.resolveReadinessLevel(fitScore),
        totalPrepMonths,
        timeEstimate,
      },
      skillBreakdown,
      detectedGaps,
      roadmap: analysis.roadmapSteps.map((step: any) => ({
        orderIndex: step.orderIndex,
        competencyId: step.competencyId,
        competencyName: step.competency.name,
        currentDisplayLevel: step.currentDisplayLevel,
        requiredDisplayLevel: step.requiredDisplayLevel,
        estimatedHours: step.estimatedHours,
        dependsOn: step.dependsOn,
        status: step.status,
        reason: step.reason,
      })),
      marketContext: {
        country: analysis.snapshot.country,
        city: analysis.snapshot.city,
        snapshotDate: analysis.snapshot.snapshotDate.toISOString().slice(0, 10),
        source: analysis.snapshot.source,
        totalVacancies: analysis.snapshot.totalVacancies,
        jobMarketNote: `${analysis.snapshot.country} market snapshot from ${analysis.snapshot.source}. ${gapText}`,
      },
    };
  }

  private classifyGapSeverity(
    matchScore: number,
    priority: string,
  ): 'CRITICAL' | 'HIGH' | 'MODERATE' | 'MINOR' {
    if (matchScore < 0.3 && priority === 'CORE') return 'CRITICAL';
    if (matchScore < 0.5) return 'HIGH';
    if (matchScore < 0.75) return 'MODERATE';
    return 'MINOR';
  }

  private resolveReadinessLevel(
    fitScore: number,
  ): 'READY' | 'NEAR_READY' | 'PREPARATION_REQUIRED' {
    if (fitScore >= 0.8) return 'READY';
    if (fitScore >= 0.6) return 'NEAR_READY';
    return 'PREPARATION_REQUIRED';
  }

  private renderHtml(snapshot: RelocationReadinessReportSnapshot): string {
    const escapedRole = this.escapeHtml(snapshot.profileSummary.desiredRole);
    const escapedCountry = this.escapeHtml(snapshot.profileSummary.targetCountry);
    const escapedCity = this.escapeHtml(snapshot.profileSummary.targetCity ?? 'N/A');

    const rows = snapshot.detectedGaps
      .map(
        (gap) => `
          <tr>
            <td>${this.escapeHtml(gap.competencyName)}</td>
            <td>${this.escapeHtml(gap.currentLevel)}</td>
            <td>${this.escapeHtml(gap.requiredLevel)}</td>
            <td>${gap.matchScore.toFixed(3)}</td>
            <td>${gap.severity}</td>
          </tr>
        `,
      )
      .join('');

    const roadmap = snapshot.roadmap
      .map(
        (step) => `
          <li>
            <strong>#${step.orderIndex + 1} ${this.escapeHtml(step.competencyName)}</strong>
            (${this.escapeHtml(step.currentDisplayLevel)} -> ${this.escapeHtml(step.requiredDisplayLevel)}, ${step.estimatedHours}h)
          </li>
        `,
      )
      .join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Relocation Readiness Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
    h1, h2 { margin: 0 0 12px 0; }
    .muted { color: #6b7280; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; }
    th { background: #f3f4f6; }
    ul { padding-left: 18px; }
  </style>
</head>
<body>
  <h1>Relocation Readiness Report</h1>
  <p class="muted">Generated ${snapshot.generatedAt.toISOString()} | Analysis ${snapshot.analysisId}</p>
    <div class="grid">
      <div class="card"><strong>Role:</strong> ${escapedRole}</div>
      <div class="card"><strong>Target:</strong> ${escapedCountry}, ${escapedCity}</div>
      <div class="card"><strong>Fit Score:</strong> ${snapshot.readiness.fitScore.toFixed(3)}</div>
      <div class="card"><strong>Readiness:</strong> ${snapshot.readiness.readinessLevel}</div>
      <div class="card"><strong>Prep (months):</strong> ${snapshot.readiness.totalPrepMonths.toFixed(1)}</div>
      <div class="card"><strong>Market Source:</strong> ${this.escapeHtml(snapshot.marketContext.source)}</div>
      <div class="card"><strong>Snapshot Date:</strong> ${this.escapeHtml(snapshot.marketContext.snapshotDate)}</div>
      <div class="card"><strong>Market Country:</strong> ${this.escapeHtml(snapshot.marketContext.country)}${snapshot.marketContext.city ? `, ${this.escapeHtml(snapshot.marketContext.city)}` : ''}</div>
      <div class="card"><strong>Total Vacancies:</strong> ${snapshot.marketContext.totalVacancies}</div>
    </div>

  <h2>Detected Gaps</h2>
  <table>
    <thead>
      <tr>
        <th>Competency</th>
        <th>Current</th>
        <th>Required</th>
        <th>Match</th>
        <th>Severity</th>
      </tr>
    </thead>
    <tbody>${rows || '<tr><td colspan="5">No actionable gaps</td></tr>'}</tbody>
  </table>

  <h2>Roadmap</h2>
  <ul>${roadmap || '<li>No roadmap steps available</li>'}</ul>

  <h2>Market Context</h2>
  <p>${this.escapeHtml(snapshot.marketContext.jobMarketNote)}</p>
</body>
</html>`;
  }

  private async renderPdfFromHtml(html: string): Promise<Buffer> {
    const pdfMakeModule: any = await import('pdfmake/build/pdfmake.js');
    const pdfFontsModule: any = await import('pdfmake/build/vfs_fonts.js');
    const pdfMake: any = pdfMakeModule.default ?? pdfMakeModule;
    const pdfVfs: any = pdfFontsModule.default ?? pdfFontsModule;

    if (typeof pdfMake.addVirtualFileSystem === 'function') {
      pdfMake.addVirtualFileSystem(pdfVfs);
    } else if (pdfVfs?.pdfMake?.vfs) {
      pdfMake.vfs = pdfVfs.pdfMake.vfs;
    }

    const window = new JSDOM('').window;
    const pdfContent = htmlToPdfmake(html, { window });
    const docDefinition = {
      content: pdfContent,
      defaultStyle: { fontSize: 10 },
      pageMargins: [24, 24, 24, 24],
    };

    const createdPdf = pdfMake.createPdf(docDefinition);
    const buffer = await createdPdf.getBuffer();
    return Buffer.from(buffer);
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
