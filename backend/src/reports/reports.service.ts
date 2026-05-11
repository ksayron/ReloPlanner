import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RelocationReadinessReportSnapshot,
  ReportAiSummary,
  ReportAiSummaryMeta,
  ReportGapItem,
  ReportGenerationMeta,
  ReportSkillBreakdownItem,
  ReportVariant,
} from './reports.types.js';
import { JSDOM } from 'jsdom';
import htmlToPdfmake from 'html-to-pdfmake';
import { AiReportEnrichmentService } from '../ai/ai-report-enrichment.service.js';
import { LegalKnowledgeEngineService } from '../legal-readiness/legal-knowledge-engine.service.js';
import { FinancialKnowledgeEngineService } from '../financial-readiness/financial-knowledge-engine.service.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiEnrichment: AiReportEnrichmentService,
    private readonly legalReadinessEngine: LegalKnowledgeEngineService,
    private readonly financialReadinessEngine: FinancialKnowledgeEngineService,
  ) {}

  async generateSnapshot(
    analysisId: string,
    userId: string,
    variant: ReportVariant = 'snapshot',
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary | null;
    aiSummaryMeta: ReportAiSummaryMeta | null;
  }> {
    const generation = this.createGenerationMeta();

    try {
      generation.status = 'GENERATING';
      const analysis = await this.loadAnalysis(analysisId, userId);
      const snapshot = await this.buildSnapshot(analysis);

      let aiSummary: ReportAiSummary | null = null;
      let aiSummaryMeta: ReportAiSummaryMeta | null = null;

      if (variant === 'ai-summary') {
        const stored = await this.loadStoredAiSummary(analysis.id);
        aiSummary = stored?.summary ?? null;
        aiSummaryMeta = stored?.meta ?? null;
      }

      generation.status = 'COMPLETED';
      generation.completedAt = new Date();
      return { generation, snapshot, variant, aiSummary, aiSummaryMeta };
    } catch (error: unknown) {
      generation.status = 'FAILED';
      generation.completedAt = new Date();
      generation.error = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    }
  }

  async renderHtmlReport(
    analysisId: string,
    userId: string,
    variant: ReportVariant = 'snapshot',
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary | null;
    aiSummaryMeta: ReportAiSummaryMeta | null;
    html: string;
  }> {
    const report = await this.generateSnapshot(analysisId, userId, variant);
    if (variant === 'ai-summary' && !report.aiSummary) {
      throw new BadRequestException(
        'AI summary has not been generated yet. Generate it first, then export.',
      );
    }
    const html = this.renderHtml(report.snapshot, report.variant, report.aiSummary, report.aiSummaryMeta);
    return { ...report, html };
  }

  async renderPdfReport(
    analysisId: string,
    userId: string,
    variant: ReportVariant = 'snapshot',
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary | null;
    aiSummaryMeta: ReportAiSummaryMeta | null;
    html: string;
    pdf: Buffer;
  }> {
    const report = await this.renderHtmlReport(analysisId, userId, variant);
    const pdf = await this.renderPdfFromHtml(report.html);
    return { ...report, pdf };
  }

  async generateAndPersistAiSummary(
    analysisId: string,
    userId: string,
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary;
    aiSummaryMeta: ReportAiSummaryMeta;
  }> {
    const generation = this.createGenerationMeta();
    generation.status = 'GENERATING';

    const analysis = await this.loadAnalysis(analysisId, userId);
    const snapshot = await this.buildSnapshot(analysis);
    const enriched = await this.aiEnrichment.summarizeSnapshot(snapshot, 'REASONING');

    await (this.prisma as any).analysisAiSummary.upsert({
      where: { analysisId: analysis.id },
      update: {
        summaryJson: enriched.summary,
        metaJson: enriched.meta,
      },
      create: {
        analysisId: analysis.id,
        summaryJson: enriched.summary,
        metaJson: enriched.meta,
      },
    });

    generation.status = 'COMPLETED';
    generation.completedAt = new Date();

    return {
      generation,
      snapshot,
      variant: 'ai-summary',
      aiSummary: enriched.summary,
      aiSummaryMeta: enriched.meta,
    };
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

  private async loadStoredAiSummary(
    analysisId: string,
  ): Promise<{ summary: ReportAiSummary; meta: ReportAiSummaryMeta } | null> {
    const row = await (this.prisma as any).analysisAiSummary.findUnique({
      where: { analysisId },
    });
    if (!row) return null;
    return {
      summary: row.summaryJson as ReportAiSummary,
      meta: row.metaJson as ReportAiSummaryMeta,
    };
  }

  private async buildSnapshot(analysis: any): Promise<RelocationReadinessReportSnapshot> {
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
      legalReadiness: this.legalReadinessEngine.evaluate({
        sourceCountry: analysis.profile.currentCountry,
        targetCountry: analysis.profile.targetCountry,
        targetCity: analysis.profile.targetCity ?? undefined,
        desiredRole: analysis.profile.desiredRole ?? undefined,
        hasExistingWorkAuthorization:
          analysis.profile.hasExistingWorkAuthorization ?? undefined,
        hasJobOffer: analysis.profile.hasJobOffer ?? undefined,
        hasRecognizedDegree: analysis.profile.hasRecognizedDegree ?? undefined,
        hasFormalEducation: analysis.profile.hasFormalEducation ?? undefined,
        relocationWithFamily: analysis.profile.relocationWithFamily ?? undefined,
      }),
      financialReadiness: await this.financialReadinessEngine.evaluate({
        targetCountry: analysis.profile.targetCountry,
        targetCity: analysis.profile.targetCity ?? undefined,
        savingsAmount: analysis.profile.savingsAmount
          ? Number(analysis.profile.savingsAmount)
          : undefined,
        savingsCurrency: analysis.profile.savingsCurrency ?? undefined,
        monthlyBudgetAmount: analysis.profile.monthlyBudgetAmount
          ? Number(analysis.profile.monthlyBudgetAmount)
          : undefined,
        monthlyBudgetCurrency: analysis.profile.monthlyBudgetCurrency ?? undefined,
        expectedNetSalaryAmount: analysis.profile.expectedNetSalaryAmount
          ? Number(analysis.profile.expectedNetSalaryAmount)
          : undefined,
        expectedNetSalaryCurrency:
          analysis.profile.expectedNetSalaryCurrency ?? undefined,
        dependentsCount: analysis.profile.dependentsCount ?? undefined,
        lifestyle: analysis.profile.lifestyle ?? undefined,
        jobSearchMonths: analysis.profile.jobSearchMonths ?? undefined,
      }),
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

  private renderHtml(
    snapshot: RelocationReadinessReportSnapshot,
    variant: ReportVariant,
    aiSummary: ReportAiSummary | null,
    aiSummaryMeta: ReportAiSummaryMeta | null,
  ): string {
    if (variant === 'ai-summary') {
      return this.renderAiSummaryHtml(snapshot, aiSummary, aiSummaryMeta);
    }
    return this.renderSnapshotHtml(snapshot);
  }

  private renderSnapshotHtml(snapshot: RelocationReadinessReportSnapshot): string {
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

    const legal = snapshot.legalReadiness;
    const legalReasons = (legal?.triggeredRules ?? [])
      .map((rule) => `<li>${this.escapeHtml(rule.description)}</li>`)
      .join('');
    const legalQuestions = (legal?.questions ?? [])
      .map((question) => `<li>${this.escapeHtml(question.text)}</li>`)
      .join('');
    const legalRoutes = (legal?.possibleRoutes ?? [])
      .map(
        (route) =>
          `<li><strong>${this.escapeHtml(route.title)}</strong>: ${this.escapeHtml(route.description)}</li>`,
      )
      .join('');
    const legalWarnings = (legal?.warnings ?? [])
      .map((warning) => `<li>${this.escapeHtml(warning.message)}</li>`)
      .join('');
    const legalAdvice = (legal?.advice ?? [])
      .map((item) => `<li>${this.escapeHtml(item.message)}</li>`)
      .join('');
    const legalArticles = (legal?.recommendedArticleSlugs ?? [])
      .map((slug) => `<li>${this.escapeHtml(slug)}</li>`)
      .join('');
    const financial = snapshot.financialReadiness;
    const financialWarnings = (financial?.warnings ?? [])
      .map((warning) => `<li>${this.escapeHtml(warning.message)}</li>`)
      .join('');
    const financialAdvice = (financial?.advice ?? [])
      .map((item) => `<li>${this.escapeHtml(item.message)}</li>`)
      .join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Relocation Readiness Snapshot</title>
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
  <h1>Profile Snapshot (No AI)</h1>
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

  <h2>Legal and Visa Readiness</h2>
  <p><strong>Risk:</strong> ${legal?.overallRisk ?? 'UNKNOWN'}</p>
  <p><strong>Visa/Legal Check Likely Required:</strong> ${legal?.visaCheckLikelyRequired ? 'Yes' : 'No'}</p>
  <h3>Why</h3>
  <ul>${legalReasons || '<li>No rule triggers available.</li>'}</ul>
  <h3>Questions to Clarify</h3>
  <ul>${legalQuestions || '<li>No additional clarification questions.</li>'}</ul>
  <h3>Possible Routes to Check</h3>
  <ul>${legalRoutes || '<li>No route hints available.</li>'}</ul>
  <h3>Warnings</h3>
  <ul>${legalWarnings || '<li>No specific warnings.</li>'}</ul>
  <h3>Advice</h3>
  <ul>${legalAdvice || '<li>No additional advice.</li>'}</ul>
  <h3>Recommended Knowledge Slugs</h3>
  <ul>${legalArticles || '<li>No recommended article slugs.</li>'}</ul>
  <p class="muted">${this.escapeHtml(legal?.disclaimer ?? 'This section is informational guidance only and not legal advice.')}</p>

  <h2>Financial Readiness</h2>
  <p><strong>Risk:</strong> ${financial?.financialRiskLevel ?? 'UNKNOWN'}</p>
  <p><strong>Monthly Cost Estimate:</strong> ${financial ? financial.costEstimate.totalMonthlyEstimateUsd.toFixed(2) : '0.00'} USD</p>
  <p><strong>Runway:</strong> ${financial?.runwayMonths !== null && financial?.runwayMonths !== undefined ? `${financial.runwayMonths.toFixed(1)} months` : 'Unavailable'}</p>
  <p><strong>Recommended Savings:</strong> ${financial ? financial.recommendedSavingsAmount.toFixed(2) : '0.00'} USD</p>
  <p>${this.escapeHtml(financial?.summary ?? 'Financial readiness summary is unavailable.')}</p>
  <h3>Warnings</h3>
  <ul>${financialWarnings || '<li>No specific warnings.</li>'}</ul>
  <h3>Advice</h3>
  <ul>${financialAdvice || '<li>No additional advice.</li>'}</ul>
</body>
</html>`;
  }

  private renderAiSummaryHtml(
    snapshot: RelocationReadinessReportSnapshot,
    aiSummary: ReportAiSummary | null,
    aiSummaryMeta: ReportAiSummaryMeta | null,
  ): string {
    const summary = aiSummary ?? {
      executiveSummary: 'AI summary is unavailable. Baseline snapshot data remains available.',
      topStrengths: ['AI output unavailable for this run.'],
      topRisks: ['AI output unavailable for this run.'],
      recommendedStrategy:
        'Use deterministic roadmap and gap sections from profile snapshot while provider access is restored.',
      advisoryDisclaimer:
        'AI-generated advisory text was unavailable for this export. Deterministic report values remain authoritative.',
    };

    const providerInfo = aiSummaryMeta
      ? `${aiSummaryMeta.providerUsed} (${this.escapeHtml(aiSummaryMeta.modelUsed)})${
          aiSummaryMeta.fallbackUsed ? ' via fallback' : ''
        }`
      : 'Unavailable';

    const strengths = summary.topStrengths
      .map((item) => `<li>${this.escapeHtml(item)}</li>`)
      .join('');
    const risks = summary.topRisks.map((item) => `<li>${this.escapeHtml(item)}</li>`).join('');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Relocation Readiness AI Summary</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; }
    h1, h2 { margin: 0 0 12px 0; }
    .muted { color: #6b7280; margin-bottom: 16px; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
    ul { padding-left: 18px; margin: 8px 0 0 0; }
  </style>
</head>
<body>
  <h1>AI Summary</h1>
  <p class="muted">Generated ${snapshot.generatedAt.toISOString()} | Analysis ${snapshot.analysisId}</p>

  <div class="grid">
    <div class="card"><strong>Fit Score:</strong> ${snapshot.readiness.fitScore.toFixed(3)}</div>
    <div class="card"><strong>Readiness:</strong> ${snapshot.readiness.readinessLevel}</div>
    <div class="card"><strong>Target:</strong> ${this.escapeHtml(snapshot.profileSummary.targetCountry)}${snapshot.profileSummary.targetCity ? `, ${this.escapeHtml(snapshot.profileSummary.targetCity)}` : ''}</div>
    <div class="card"><strong>AI Provider:</strong> ${providerInfo}</div>
  </div>

  <div class="card">
    <h2>Executive Summary</h2>
    <p>${this.escapeHtml(summary.executiveSummary)}</p>
  </div>

  <div class="card">
    <h2>Top Strengths</h2>
    <ul>${strengths}</ul>
  </div>

  <div class="card">
    <h2>Top Risks</h2>
    <ul>${risks}</ul>
  </div>

  <div class="card">
    <h2>Recommended Strategy</h2>
    <p>${this.escapeHtml(summary.recommendedStrategy)}</p>
  </div>

  <p class="muted">${this.escapeHtml(summary.advisoryDisclaimer)}</p>
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
