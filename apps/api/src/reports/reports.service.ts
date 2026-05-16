import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  RelocationReadinessReportSnapshot,
  ReportAiSummary,
  ReportAiSummaryMeta,
  ReportGapItem,
  ReportGenerationMeta,
  ReportLocale,
  ReportSkillBreakdownItem,
  ReportVariant,
} from './reports.types.js';
import { JSDOM } from 'jsdom';
import htmlToPdfmake from 'html-to-pdfmake';
import { AiReportEnrichmentService } from '../ai/ai-report-enrichment.service.js';
import { LegalKnowledgeEngineService } from '../legal-readiness/legal-knowledge-engine.service.js';
import { FinancialKnowledgeEngineService } from '../financial-readiness/financial-knowledge-engine.service.js';

const reportTexts = (locale: ReportLocale) => {
  if (locale === 'ru') {
    return {
      aiSummaryMissing:
        'AI-сводка еще не сгенерирована. Сначала сгенерируйте ее, затем экспортируйте.',
      pdfTitleAi: 'AI-сводка готовности к релокации',
      pdfTitleSnapshot: 'Снимок готовности к релокации',
      unknownError: 'Неизвестная ошибка',
      topGapsPrefix: 'Ключевые пробелы',
      noMajorGaps: 'Критичных пробелов не обнаружено.',
      marketSnapshotNote: (country: string, source: string, gapText: string) =>
        `Снимок рынка ${country} из ${source}. ${gapText}`,
      aiFallbackExecutiveSummary:
        'AI-сводка недоступна. Базовые данные snapshot остаются доступными.',
      aiFallbackStrength: 'AI-вывод для этого запуска недоступен.',
      aiFallbackRisk: 'AI-вывод для этого запуска недоступен.',
      aiFallbackStrategy:
        'Используйте детерминированные разделы дорожной карты и пробелов из snapshot профиля, пока доступ провайдера не восстановлен.',
      aiFallbackDisclaimer:
        'AI-консультационный текст был недоступен для этого экспорта. Детерминированные значения отчета остаются приоритетным источником.',
      providerUnavailable: 'Недоступно',
      viaFallback: ' через fallback',
    };
  }

  return {
    aiSummaryMissing:
      'AI summary has not been generated yet. Generate it first, then export.',
    pdfTitleAi: 'Relocation Readiness AI Summary',
    pdfTitleSnapshot: 'Relocation Readiness Snapshot',
    unknownError: 'Unknown error',
    topGapsPrefix: 'Top gaps',
    noMajorGaps: 'No major gaps detected.',
    marketSnapshotNote: (country: string, source: string, gapText: string) =>
      `${country} market snapshot from ${source}. ${gapText}`,
    aiFallbackExecutiveSummary:
      'AI summary is unavailable. Baseline snapshot data remains available.',
    aiFallbackStrength: 'AI output unavailable for this run.',
    aiFallbackRisk: 'AI output unavailable for this run.',
    aiFallbackStrategy:
      'Use deterministic roadmap and gap sections from profile snapshot while provider access is restored.',
    aiFallbackDisclaimer:
      'AI-generated advisory text was unavailable for this export. Deterministic report values remain authoritative.',
    providerUnavailable: 'Unavailable',
    viaFallback: ' via fallback',
  };
};

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
    locale: ReportLocale = 'en',
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary | null;
    aiSummaryMeta: ReportAiSummaryMeta | null;
  }> {
    const texts = reportTexts(locale);
    const generation = this.createGenerationMeta();

    try {
      generation.status = 'GENERATING';
      const analysis = await this.loadAnalysis(analysisId, userId);
      const snapshot = await this.buildSnapshot(analysis, locale);

      let aiSummary: ReportAiSummary | null = null;
      let aiSummaryMeta: ReportAiSummaryMeta | null = null;

      if (variant === 'ai-summary') {
        const stored = await this.loadStoredAiSummary(analysis.id);
        const storedLocale = stored?.meta?.localeUsed;
        const localeMatches =
          storedLocale === locale || (!storedLocale && locale === 'en');
        aiSummary = localeMatches ? (stored?.summary ?? null) : null;
        aiSummaryMeta = localeMatches ? (stored?.meta ?? null) : null;
      }

      generation.status = 'COMPLETED';
      generation.completedAt = new Date();
      return { generation, snapshot, variant, aiSummary, aiSummaryMeta };
    } catch (error: unknown) {
      generation.status = 'FAILED';
      generation.completedAt = new Date();
      generation.error =
        error instanceof Error ? error.message : texts.unknownError;
      throw error;
    }
  }

  async renderHtmlReport(
    analysisId: string,
    userId: string,
    variant: ReportVariant = 'snapshot',
    locale: ReportLocale = 'en',
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary | null;
    aiSummaryMeta: ReportAiSummaryMeta | null;
    html: string;
  }> {
    const texts = reportTexts(locale);
    const report = await this.generateSnapshot(
      analysisId,
      userId,
      variant,
      locale,
    );
    if (variant === 'ai-summary' && !report.aiSummary) {
      throw new BadRequestException(texts.aiSummaryMissing);
    }
    const html = this.renderHtml(
      report.snapshot,
      report.variant,
      report.aiSummary,
      report.aiSummaryMeta,
      locale,
    );
    return { ...report, html };
  }

  async renderPdfReport(
    analysisId: string,
    userId: string,
    variant: ReportVariant = 'snapshot',
    locale: ReportLocale = 'en',
  ): Promise<{
    generation: ReportGenerationMeta;
    snapshot: RelocationReadinessReportSnapshot;
    variant: ReportVariant;
    aiSummary: ReportAiSummary | null;
    aiSummaryMeta: ReportAiSummaryMeta | null;
    html: string;
    pdf: Buffer;
  }> {
    const report = await this.renderHtmlReport(
      analysisId,
      userId,
      variant,
      locale,
    );
    const pdf = await this.renderPdfFromHtml(report.html, {
      title:
        variant === 'ai-summary'
          ? reportTexts(locale).pdfTitleAi
          : reportTexts(locale).pdfTitleSnapshot,
      analysisId,
      generatedAtIso: report.snapshot.generatedAt.toISOString(),
      locale,
    });
    return { ...report, pdf };
  }

  async generateAndPersistAiSummary(
    analysisId: string,
    userId: string,
    locale: ReportLocale = 'en',
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
    const snapshot = await this.buildSnapshot(analysis, locale);
    const enriched = await this.aiEnrichment.summarizeSnapshot(
      snapshot,
      'REASONING',
      locale,
    );

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

  private async buildSnapshot(
    analysis: any,
    locale: ReportLocale,
  ): Promise<RelocationReadinessReportSnapshot> {
    const texts = reportTexts(locale);
    const fitScore = Number(analysis.fitScore);
    const totalPrepMonths = Number(analysis.totalPrepMonths);
    const skillBreakdownRaw = Array.isArray(analysis.skillBreakdown)
      ? analysis.skillBreakdown
      : [];

    const skillBreakdown: ReportSkillBreakdownItem[] = skillBreakdownRaw.map(
      (item: any) => ({
        competencyId: String(item.competencyId ?? ''),
        competencyName: String(item.competencyName ?? ''),
        matchScore: Number(item.matchScore ?? 0),
        weight: Number(item.weight ?? 0),
        recommendationType: String(item.recommendationType ?? 'MARKET_CONTEXT'),
        reason: String(item.reason ?? ''),
      }),
    );

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
      .sort(
        (a: ReportGapItem, b: ReportGapItem) => a.matchScore - b.matchScore,
      );

    const timeEstimate =
      analysis.timeEstimate && typeof analysis.timeEstimate === 'object'
        ? {
            optimisticHours: Number(analysis.timeEstimate.optimisticHours ?? 0),
            realisticHours: Number(analysis.timeEstimate.realisticHours ?? 0),
            criticalPathHours: Number(
              analysis.timeEstimate.criticalPathHours ?? 0,
            ),
          }
        : null;

    const topGapNames = detectedGaps
      .slice(0, 3)
      .map((gap) => gap.competencyName);
    const gapText =
      topGapNames.length > 0
        ? `${texts.topGapsPrefix}: ${topGapNames.join(', ')}`
        : texts.noMajorGaps;

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
        snapshotDate: this.formatDate(analysis.snapshot.snapshotDate, locale),
        source: analysis.snapshot.source,
        totalVacancies: analysis.snapshot.totalVacancies,
        jobMarketNote: texts.marketSnapshotNote(
          analysis.snapshot.country,
          analysis.snapshot.source,
          gapText,
        ),
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
        relocationWithFamily:
          analysis.profile.relocationWithFamily ?? undefined,
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
        monthlyBudgetCurrency:
          analysis.profile.monthlyBudgetCurrency ?? undefined,
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
    locale: ReportLocale,
  ): string {
    if (variant === 'ai-summary') {
      return this.renderAiSummaryHtml(
        snapshot,
        aiSummary,
        aiSummaryMeta,
        locale,
      );
    }
    return this.renderSnapshotHtml(snapshot, locale);
  }

  private renderSnapshotHtml(
    snapshot: RelocationReadinessReportSnapshot,
    locale: ReportLocale,
  ): string {
    const isRu = locale === 'ru';
    const copy = isRu
      ? {
          htmlLang: 'ru',
          title: 'Отчет готовности к релокации (Snapshot)',
          generated: 'Сформирован',
          analysis: 'Анализ',
          section1: '1. Сводка профиля',
          role: 'Роль',
          sourceCountry: 'Исходная страна',
          target: 'Цель',
          experience: 'Опыт',
          years: 'лет',
          monthsWord: 'месяцев',
          section2: '2. Соответствие и готовность',
          fitScore: 'Fit Score',
          readiness: 'Готовность',
          prepMonths: 'Подготовка (месяцы)',
          criticalPathHours: 'Критический путь (часы)',
          skillBreakdown: 'Разбивка навыков (топ 10 по сохраненному порядку)',
          competency: 'Компетенция',
          match: 'Совпадение',
          weight: 'Вес',
          type: 'Тип',
          noSkillBreakdownData: 'Нет данных по разбивке навыков',
          section3: '3. Пробелы и дорожная карта',
          detectedGaps: 'Выявленные пробелы',
          current: 'Текущий',
          required: 'Требуемый',
          severity: 'Критичность',
          noActionableGaps: 'Нет actionable gaps',
          roadmap: 'Дорожная карта',
          noRoadmapSteps: 'Шаги дорожной карты недоступны',
          section4: '4. Сводка рисков',
          marketRiskVolume: 'Риск рынка (объем вакансий)',
          legalRisk: 'Юридический риск',
          financialRisk: 'Финансовый риск',
          totalVacanciesSnapshot: 'Всего вакансий в snapshot',
          section5: '5. Контекст рынка',
          marketSource: 'Источник рынка',
          snapshotDate: 'Дата snapshot',
          marketCountry: 'Страна рынка',
          totalVacancies: 'Всего вакансий',
          section6: '6. Юридическая и визовая готовность',
          legalCheckLikely: 'Вероятно требуется виза/юридическая проверка',
          yes: 'Да',
          no: 'Нет',
          why: 'Почему',
          noRuleTriggers: 'Триггеры правил недоступны.',
          questionsToClarify: 'Вопросы для уточнения',
          noAdditionalQuestions: 'Дополнительных вопросов нет.',
          possibleRoutes: 'Возможные маршруты',
          noRouteHints: 'Подсказки по маршрутам недоступны.',
          warnings: 'Предупреждения',
          noWarnings: 'Специфичных предупреждений нет.',
          advice: 'Рекомендации',
          noAdvice: 'Дополнительных рекомендаций нет.',
          recommendedKnowledgeSlugs: 'Рекомендуемые Knowledge Slug',
          noRecommendedSlugs: 'Рекомендуемые slug не найдены.',
          legalDisclaimerFallback:
            'Этот раздел носит информационный характер и не является юридической консультацией.',
          section7: '7. Финансовая готовность',
          monthlyCostEstimate: 'Оценка ежемесячных расходов',
          runway: 'Финансовый запас',
          unavailable: 'Недоступно',
          recommendedSavings: 'Рекомендуемые накопления',
          financialSummaryUnavailable:
            'Сводка финансовой готовности недоступна.',
          costBreakdown: 'Структура расходов',
          category: 'Категория',
          estimatedMonthlyCost: 'Оценка ежемесячной стоимости',
          noCategoryCostData: 'Нет данных по категориям стоимости',
          section8: '8. Лучшие совпадения вакансий',
          topJobsPlaceholder:
            'Лучшие совпадения вакансий пока не прикреплены к этому snapshot.',
          section9: '9. Советы по CV',
          cvAdvicePlaceholder:
            'Советы по адаптации CV пока не прикреплены к этому snapshot. Используйте результат issue #52, когда он доступен.',
          unknown: 'НЕИЗВЕСТНО',
        }
      : {
          htmlLang: 'en',
          title: 'Relocation Readiness Report (Snapshot)',
          generated: 'Generated',
          analysis: 'Analysis',
          section1: '1. Profile Summary',
          role: 'Role',
          sourceCountry: 'Source Country',
          target: 'Target',
          experience: 'Experience',
          years: 'years',
          monthsWord: 'months',
          section2: '2. Fit and Readiness',
          fitScore: 'Fit Score',
          readiness: 'Readiness',
          prepMonths: 'Prep (months)',
          criticalPathHours: 'Critical Path (hours)',
          skillBreakdown: 'Skill Breakdown (Top 10 by stored order)',
          competency: 'Competency',
          match: 'Match',
          weight: 'Weight',
          type: 'Type',
          noSkillBreakdownData: 'No skill breakdown data',
          section3: '3. Gaps and Roadmap',
          detectedGaps: 'Detected Gaps',
          current: 'Current',
          required: 'Required',
          severity: 'Severity',
          noActionableGaps: 'No actionable gaps',
          roadmap: 'Roadmap',
          noRoadmapSteps: 'No roadmap steps available',
          section4: '4. Risk Summary',
          marketRiskVolume: 'Market Risk (vacancy volume)',
          legalRisk: 'Legal Risk',
          financialRisk: 'Financial Risk',
          totalVacanciesSnapshot: 'Total Vacancies in Snapshot',
          section5: '5. Market Context',
          marketSource: 'Market Source',
          snapshotDate: 'Snapshot Date',
          marketCountry: 'Market Country',
          totalVacancies: 'Total Vacancies',
          section6: '6. Legal and Visa Readiness',
          legalCheckLikely: 'Visa/Legal Check Likely Required',
          yes: 'Yes',
          no: 'No',
          why: 'Why',
          noRuleTriggers: 'No rule triggers available.',
          questionsToClarify: 'Questions to Clarify',
          noAdditionalQuestions: 'No additional clarification questions.',
          possibleRoutes: 'Possible Routes to Check',
          noRouteHints: 'No route hints available.',
          warnings: 'Warnings',
          noWarnings: 'No specific warnings.',
          advice: 'Advice',
          noAdvice: 'No additional advice.',
          recommendedKnowledgeSlugs: 'Recommended Knowledge Slugs',
          noRecommendedSlugs: 'No recommended article slugs.',
          legalDisclaimerFallback:
            'This section is informational guidance only and not legal advice.',
          section7: '7. Financial Readiness',
          monthlyCostEstimate: 'Monthly Cost Estimate',
          runway: 'Runway',
          unavailable: 'Unavailable',
          recommendedSavings: 'Recommended Savings',
          financialSummaryUnavailable:
            'Financial readiness summary is unavailable.',
          costBreakdown: 'Cost Breakdown',
          category: 'Category',
          estimatedMonthlyCost: 'Estimated Monthly Cost',
          noCategoryCostData: 'No category-level cost data available',
          section8: '8. Top Job Matches',
          topJobsPlaceholder:
            'Top job matches are not attached to this snapshot yet.',
          section9: '9. CV Advice',
          cvAdvicePlaceholder:
            'CV adaptation advice is not attached to this snapshot yet. Use issue #52 output when available.',
          unknown: 'UNKNOWN',
        };

    const escapedRole = this.escapeHtml(snapshot.profileSummary.desiredRole);
    const escapedCountry = this.escapeHtml(
      snapshot.profileSummary.targetCountry,
    );
    const escapedCity = this.escapeHtml(
      snapshot.profileSummary.targetCity ?? copy.unavailable,
    );
    const fitScorePct = Math.round(snapshot.readiness.fitScore * 100);
    const readinessTone =
      snapshot.readiness.readinessLevel === 'READY'
        ? 'good'
        : snapshot.readiness.readinessLevel === 'NEAR_READY'
          ? 'warn'
          : 'risk';

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
    const skillBreakdownRows = snapshot.skillBreakdown
      .slice(0, 10)
      .map(
        (item) => `
          <tr>
            <td>${this.escapeHtml(item.competencyName)}</td>
            <td>${Math.round(item.matchScore * 100)}%</td>
            <td>${Math.round(item.weight * 100)}%</td>
            <td>${this.escapeHtml(item.recommendationType)}</td>
          </tr>
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
    const financialCostRows = (financial?.costEstimate?.categories ?? [])
      .map(
        (cat) => `
          <tr>
            <td>${this.escapeHtml(cat.category)}</td>
            <td>${cat.monthlyAmountUsd.toFixed(2)} USD</td>
          </tr>
        `,
      )
      .join('');
    const topJobsPlaceholder = `<li>${copy.topJobsPlaceholder}</li>`;
    const cvAdvicePlaceholder = `<li>${copy.cvAdvicePlaceholder}</li>`;
    const marketRiskLabel =
      snapshot.marketContext.totalVacancies < 100
        ? 'HIGH'
        : snapshot.marketContext.totalVacancies < 250
          ? 'MEDIUM'
          : 'LOW';

    return `<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8" />
  <title>${copy.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #1f2937; line-height: 1.45; }
    h1, h2 { margin: 0 0 12px 0; }
    h3 { margin: 12px 0 8px 0; }
    .muted { color: #6b7280; margin-bottom: 16px; }
    .section { margin: 20px 0; padding-top: 12px; border-top: 1px solid #e5e7eb; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; background: #fff; }
    .pill { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    .pill.good { background: #dcfce7; color: #166534; }
    .pill.warn { background: #fef3c7; color: #92400e; }
    .pill.risk { background: #fee2e2; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: left; font-size: 12px; vertical-align: top; }
    th { background: #f3f4f6; }
    ul { padding-left: 18px; margin: 6px 0 0 0; }
  </style>
</head>
<body>
  <h1>${copy.title}</h1>
  <p class="muted">${copy.generated} ${snapshot.generatedAt.toISOString()} | ${copy.analysis} ${snapshot.analysisId}</p>
  <div class="section">
    <h2>${copy.section1}</h2>
    <div class="grid">
      <div class="card"><strong>${copy.role}:</strong> ${escapedRole}</div>
      <div class="card"><strong>${copy.sourceCountry}:</strong> ${this.escapeHtml(snapshot.profileSummary.currentCountry)}</div>
      <div class="card"><strong>${copy.target}:</strong> ${escapedCountry}, ${escapedCity}</div>
      <div class="card"><strong>${copy.experience}:</strong> ${snapshot.profileSummary.yearsExperience} ${copy.years}</div>
    </div>
  </div>

  <div class="section">
    <h2>${copy.section2}</h2>
    <div class="grid">
      <div class="card"><strong>${copy.fitScore}:</strong> ${fitScorePct}%</div>
      <div class="card"><strong>${copy.readiness}:</strong> <span class="pill ${readinessTone}">${snapshot.readiness.readinessLevel}</span></div>
      <div class="card"><strong>${copy.prepMonths}:</strong> ${snapshot.readiness.totalPrepMonths.toFixed(1)}</div>
      <div class="card"><strong>${copy.criticalPathHours}:</strong> ${snapshot.readiness.timeEstimate?.criticalPathHours ?? 0}</div>
    </div>
    <h3>${copy.skillBreakdown}</h3>
    <table>
      <thead>
        <tr>
          <th>${copy.competency}</th>
          <th>${copy.match}</th>
          <th>${copy.weight}</th>
          <th>${copy.type}</th>
        </tr>
      </thead>
      <tbody>${skillBreakdownRows || `<tr><td colspan="4">${copy.noSkillBreakdownData}</td></tr>`}</tbody>
    </table>
  </div>

  <div class="section">
    <h2>${copy.section3}</h2>
    <h3>${copy.detectedGaps}</h3>
    <table>
      <thead>
        <tr>
          <th>${copy.competency}</th>
          <th>${copy.current}</th>
          <th>${copy.required}</th>
          <th>${copy.match}</th>
          <th>${copy.severity}</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="5">${copy.noActionableGaps}</td></tr>`}</tbody>
    </table>
    <h3>${copy.roadmap}</h3>
    <ul>${roadmap || `<li>${copy.noRoadmapSteps}</li>`}</ul>
  </div>

  <div class="section">
    <h2>${copy.section4}</h2>
    <div class="grid">
      <div class="card"><strong>${copy.marketRiskVolume}:</strong> ${marketRiskLabel}</div>
      <div class="card"><strong>${copy.legalRisk}:</strong> ${legal?.overallRisk ?? copy.unknown}</div>
      <div class="card"><strong>${copy.financialRisk}:</strong> ${financial?.financialRiskLevel ?? copy.unknown}</div>
      <div class="card"><strong>${copy.totalVacanciesSnapshot}:</strong> ${snapshot.marketContext.totalVacancies}</div>
    </div>
  </div>

  <div class="section">
    <h2>${copy.section5}</h2>
    <div class="grid">
      <div class="card"><strong>${copy.marketSource}:</strong> ${this.escapeHtml(snapshot.marketContext.source)}</div>
      <div class="card"><strong>${copy.snapshotDate}:</strong> ${this.escapeHtml(snapshot.marketContext.snapshotDate)}</div>
      <div class="card"><strong>${copy.marketCountry}:</strong> ${this.escapeHtml(snapshot.marketContext.country)}${snapshot.marketContext.city ? `, ${this.escapeHtml(snapshot.marketContext.city)}` : ''}</div>
      <div class="card"><strong>${copy.totalVacancies}:</strong> ${snapshot.marketContext.totalVacancies}</div>
    </div>
    <p>${this.escapeHtml(snapshot.marketContext.jobMarketNote)}</p>
  </div>

  <div class="section">
    <h2>${copy.section6}</h2>
    <p><strong>${copy.legalCheckLikely}:</strong> ${legal?.visaCheckLikelyRequired ? copy.yes : copy.no}</p>
    <h3>${copy.why}</h3>
    <ul>${legalReasons || `<li>${copy.noRuleTriggers}</li>`}</ul>
    <h3>${copy.questionsToClarify}</h3>
    <ul>${legalQuestions || `<li>${copy.noAdditionalQuestions}</li>`}</ul>
    <h3>${copy.possibleRoutes}</h3>
    <ul>${legalRoutes || `<li>${copy.noRouteHints}</li>`}</ul>
    <h3>${copy.warnings}</h3>
    <ul>${legalWarnings || `<li>${copy.noWarnings}</li>`}</ul>
    <h3>${copy.advice}</h3>
    <ul>${legalAdvice || `<li>${copy.noAdvice}</li>`}</ul>
    <h3>${copy.recommendedKnowledgeSlugs}</h3>
    <ul>${legalArticles || `<li>${copy.noRecommendedSlugs}</li>`}</ul>
    <p class="muted">${this.escapeHtml(legal?.disclaimer ?? copy.legalDisclaimerFallback)}</p>
  </div>

  <div class="section">
    <h2>${copy.section7}</h2>
    <p><strong>${copy.monthlyCostEstimate}:</strong> ${financial ? financial.costEstimate.totalMonthlyEstimateUsd.toFixed(2) : '0.00'} USD</p>
    <p><strong>${copy.runway}:</strong> ${financial?.runwayMonths !== null && financial?.runwayMonths !== undefined ? `${financial.runwayMonths.toFixed(1)} ${copy.monthsWord}` : copy.unavailable}</p>
    <p><strong>${copy.recommendedSavings}:</strong> ${financial ? financial.recommendedSavingsAmount.toFixed(2) : '0.00'} USD</p>
    <p>${this.escapeHtml(financial?.summary ?? copy.financialSummaryUnavailable)}</p>
    <h3>${copy.costBreakdown}</h3>
    <table>
      <thead>
        <tr>
          <th>${copy.category}</th>
          <th>${copy.estimatedMonthlyCost}</th>
        </tr>
      </thead>
      <tbody>${financialCostRows || `<tr><td colspan="2">${copy.noCategoryCostData}</td></tr>`}</tbody>
    </table>
    <h3>${copy.warnings}</h3>
    <ul>${financialWarnings || `<li>${copy.noWarnings}</li>`}</ul>
    <h3>${copy.advice}</h3>
    <ul>${financialAdvice || `<li>${copy.noAdvice}</li>`}</ul>
  </div>

  <div class="section">
    <h2>${copy.section8}</h2>
    <ul>${topJobsPlaceholder}</ul>
  </div>

  <div class="section">
    <h2>${copy.section9}</h2>
    <ul>${cvAdvicePlaceholder}</ul>
  </div>
</body>
</html>`;
  }

  private renderAiSummaryHtml(
    snapshot: RelocationReadinessReportSnapshot,
    aiSummary: ReportAiSummary | null,
    aiSummaryMeta: ReportAiSummaryMeta | null,
    locale: ReportLocale,
  ): string {
    const texts = reportTexts(locale);
    const isRu = locale === 'ru';
    const copy = isRu
      ? {
          htmlLang: 'ru',
          title: 'AI-сводка',
          generated: 'Сформирован',
          analysis: 'Анализ',
          fitScore: 'Fit Score',
          readiness: 'Готовность',
          target: 'Цель',
          aiProvider: 'AI-провайдер',
          executiveSummary: 'Краткий итог',
          topStrengths: 'Сильные стороны',
          topRisks: 'Риски',
          recommendedStrategy: 'Рекомендуемая стратегия',
        }
      : {
          htmlLang: 'en',
          title: 'AI Summary',
          generated: 'Generated',
          analysis: 'Analysis',
          fitScore: 'Fit Score',
          readiness: 'Readiness',
          target: 'Target',
          aiProvider: 'AI Provider',
          executiveSummary: 'Executive Summary',
          topStrengths: 'Top Strengths',
          topRisks: 'Top Risks',
          recommendedStrategy: 'Recommended Strategy',
        };

    const summary = aiSummary ?? {
      executiveSummary: texts.aiFallbackExecutiveSummary,
      topStrengths: [texts.aiFallbackStrength],
      topRisks: [texts.aiFallbackRisk],
      recommendedStrategy: texts.aiFallbackStrategy,
      advisoryDisclaimer: texts.aiFallbackDisclaimer,
    };

    const providerInfo = aiSummaryMeta
      ? `${aiSummaryMeta.providerUsed} (${this.escapeHtml(aiSummaryMeta.modelUsed)})${
          aiSummaryMeta.fallbackUsed ? texts.viaFallback : ''
        }`
      : texts.providerUnavailable;

    const strengths = summary.topStrengths
      .map((item) => `<li>${this.escapeHtml(item)}</li>`)
      .join('');
    const risks = summary.topRisks
      .map((item) => `<li>${this.escapeHtml(item)}</li>`)
      .join('');

    return `<!doctype html>
<html lang="${copy.htmlLang}">
<head>
  <meta charset="utf-8" />
  <title>${isRu ? 'AI-сводка готовности к релокации' : 'Relocation Readiness AI Summary'}</title>
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
  <h1>${copy.title}</h1>
  <p class="muted">${copy.generated} ${snapshot.generatedAt.toISOString()} | ${copy.analysis} ${snapshot.analysisId}</p>

  <div class="grid">
    <div class="card"><strong>${copy.fitScore}:</strong> ${snapshot.readiness.fitScore.toFixed(3)}</div>
    <div class="card"><strong>${copy.readiness}:</strong> ${snapshot.readiness.readinessLevel}</div>
    <div class="card"><strong>${copy.target}:</strong> ${this.escapeHtml(snapshot.profileSummary.targetCountry)}${snapshot.profileSummary.targetCity ? `, ${this.escapeHtml(snapshot.profileSummary.targetCity)}` : ''}</div>
    <div class="card"><strong>${copy.aiProvider}:</strong> ${providerInfo}</div>
  </div>

  <div class="card">
    <h2>${copy.executiveSummary}</h2>
    <p>${this.escapeHtml(summary.executiveSummary)}</p>
  </div>

  <div class="card">
    <h2>${copy.topStrengths}</h2>
    <ul>${strengths}</ul>
  </div>

  <div class="card">
    <h2>${copy.topRisks}</h2>
    <ul>${risks}</ul>
  </div>

  <div class="card">
    <h2>${copy.recommendedStrategy}</h2>
    <p>${this.escapeHtml(summary.recommendedStrategy)}</p>
  </div>

  <p class="muted">${this.escapeHtml(summary.advisoryDisclaimer)}</p>
</body>
</html>`;
  }

  private async renderPdfFromHtml(
    html: string,
    context: {
      title: string;
      analysisId: string;
      generatedAtIso: string;
      locale: ReportLocale;
    },
  ): Promise<Buffer> {
    try {
      const isRu = context.locale === 'ru';
      const generatedLabel = isRu ? 'Сформирован' : 'Generated';
      const pageLabel = isRu ? 'Страница' : 'Page';
      const ofLabel = isRu ? 'из' : 'of';
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
      const pdfContent = htmlToPdfmake(html, {
        window,
        tableAutoSize: true,
      });

      const docDefinition = {
        pageSize: 'A4',
        pageMargins: [32, 56, 32, 42],
        header: (_currentPage: number, _pageCount: number) => ({
          margin: [32, 18, 32, 0],
          fontSize: 9,
          color: '#6b7280',
          text: `${context.title} | Analysis ${context.analysisId}`,
        }),
        footer: (currentPage: number, pageCount: number) => ({
          margin: [32, 0, 32, 14],
          columns: [
            {
              text: `${generatedLabel} ${context.generatedAtIso}`,
              fontSize: 8,
              color: '#6b7280',
            },
            {
              text: `${pageLabel} ${currentPage} ${ofLabel} ${pageCount}`,
              alignment: 'right',
              fontSize: 8,
              color: '#6b7280',
            },
          ],
        }),
        content: pdfContent,
        defaultStyle: {
          font: 'Roboto',
          fontSize: 10,
          lineHeight: 1.25,
        },
        styles: {
          h1: { fontSize: 20, bold: true, margin: [0, 0, 0, 10] },
          h2: { fontSize: 14, bold: true, margin: [0, 10, 0, 6] },
          h3: { fontSize: 12, bold: true, margin: [0, 8, 0, 4] },
          p: { margin: [0, 0, 0, 6] },
          table: { margin: [0, 6, 0, 10] },
          li: { margin: [0, 0, 0, 3] },
        },
      };

      const createdPdf = pdfMake.createPdf(docDefinition);
      const buffer = await createdPdf.getBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      const isRu = context.locale === 'ru';
      const reason =
        error instanceof Error
          ? error.message
          : isRu
            ? 'Неизвестная ошибка генерации PDF'
            : 'Unknown PDF generation error';
      throw new InternalServerErrorException(
        isRu
          ? `Не удалось сгенерировать PDF-отчет: ${reason}`
          : `Failed to generate PDF report: ${reason}`,
      );
    }
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  private formatDate(value: Date, locale: ReportLocale): string {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  }
}
