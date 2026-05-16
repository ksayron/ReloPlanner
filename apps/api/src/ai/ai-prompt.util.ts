import { RelocationReadinessReportSnapshot } from '../reports/reports.types.js';
import { ReportLocale } from '../reports/reports.types.js';
import { AiReportSummary } from './ai.types.js';

export function buildAiSummaryPrompt(
  snapshot: RelocationReadinessReportSnapshot,
  locale: ReportLocale,
): string {
  const localeLabel = locale === 'ru' ? 'Russian' : 'English';
  const payload = JSON.stringify(snapshot);
  const persona = [
    `Target role: ${snapshot.profileSummary.desiredRole}`,
    `Target location: ${snapshot.profileSummary.targetCountry}${snapshot.profileSummary.targetCity ? `, ${snapshot.profileSummary.targetCity}` : ''}`,
    `Current country: ${snapshot.profileSummary.currentCountry}`,
    `Experience: ${snapshot.profileSummary.yearsExperience} years`,
    `Fit score: ${Math.round(snapshot.readiness.fitScore * 100)}%`,
  ].join(' | ');
  return [
    'You are generating an advisory summary for a relocation readiness report.',
    `Return every field in ${localeLabel}.`,
    'Use ONLY the snapshot JSON provided by the user. Do not invent facts.',
    'Keep deterministic metrics authoritative and unchanged.',
    'Make the text personal to this candidate context and current readiness.',
    'Do not restate generic profile fields unless needed for recommendations.',
    'Extract signal from gaps, roadmap order, and market context to provide non-obvious prioritization.',
    'Recommendations must be concrete and sequencing-aware (what to do first, what to defer).',
    'Return JSON with keys:',
    'executiveSummary (string, max 2 sentences),',
    'topStrengths (array of exactly 3 short strings),',
    'topRisks (array of exactly 3 short strings),',
    'recommendedStrategy (string, max 4 sentences, include near-term and medium-term actions).',
    'advisoryDisclaimer (string, 1 sentence noting advisory AI text).',
    'If data is missing, state limitations clearly but still return all keys.',
    '',
    `CANDIDATE_CONTEXT: ${persona}`,
    `SNAPSHOT_JSON: ${payload}`,
  ].join('\n');
}

const localizedDefaults = (locale: ReportLocale) => {
  if (locale === 'ru') {
    return {
      advisoryDisclaimer:
        'AI-сгенерированный консультационный текст. Проверьте вывод по детерминированным метрикам отчета.',
      missingStrengths:
        'Базовые данные профиля доступны, но сильные стороны не удалось раскрыть.',
      missingRisks: 'Детали рисков в сгенерированном AI-выводе ограничены.',
      mockExecutiveSummary: (
        fitScorePct: number,
        role: string,
        country: string,
      ) =>
        `Текущая готовность составляет ${fitScorePct}% для роли ${role} в ${country}. Основной фокус должен оставаться на выполнении приоритетных шагов дорожной карты.`,
      mockNoStrengths:
        'По данным snapshot не обнаружено выраженных совпадений компетенций.',
      mockNoRisks: 'Критические риски в actionable gaps не выявлены.',
      mockStrategy:
        'Сначала закройте верхние пункты дорожной карты, затем повторно запустите анализ после измеримого прогресса, чтобы подтвердить снижение рисков и рост fit score.',
      mockDisclaimer:
        'AI-сгенерированный консультационный текст. Детерминированные fit score, gaps и roadmap остаются источником истины.',
    };
  }

  return {
    advisoryDisclaimer:
      'AI-generated advisory text. Verify with deterministic report metrics.',
    missingStrengths:
      'Core profile data is available but strengths could not be expanded.',
    missingRisks: 'Risk details were limited in the generated AI output.',
    mockExecutiveSummary: (
      fitScorePct: number,
      role: string,
      country: string,
    ) =>
      `Current readiness is ${fitScorePct}% for ${role} in ${country}. Focus should remain on prioritized roadmap execution.`,
    mockNoStrengths:
      'No strong competency matches were detected from snapshot data.',
    mockNoRisks: 'No critical risks were detected in actionable gaps.',
    mockStrategy:
      'Address top roadmap items first, then re-run analysis after measurable progress to confirm risk reduction and fit-score improvement.',
    mockDisclaimer:
      'AI-generated advisory text. Deterministic fit score, gaps, and roadmap remain the source of truth.',
  };
};

const sanitizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
};

export function parseAiSummaryJson(
  raw: string,
  locale: ReportLocale,
): AiReportSummary {
  const texts = localizedDefaults(locale);
  const parsed = JSON.parse(raw) as Partial<AiReportSummary>;
  const executiveSummary = String(parsed.executiveSummary ?? '').trim();
  const recommendedStrategy = String(parsed.recommendedStrategy ?? '').trim();
  const advisoryDisclaimer =
    String(parsed.advisoryDisclaimer ?? '').trim() ||
    texts.advisoryDisclaimer;
  const topStrengths = sanitizeList(parsed.topStrengths);
  const topRisks = sanitizeList(parsed.topRisks);

  if (!executiveSummary || !recommendedStrategy) {
    throw new Error(
      locale === 'ru'
        ? 'AI-ответ не содержит обязательные поля сводки'
        : 'AI response is missing required summary fields',
    );
  }

  return {
    executiveSummary,
    topStrengths:
      topStrengths.length > 0
        ? topStrengths
        : [texts.missingStrengths],
    topRisks:
      topRisks.length > 0
        ? topRisks
        : [texts.missingRisks],
    recommendedStrategy,
    advisoryDisclaimer,
  };
}

export function buildMockSummary(
  snapshot: RelocationReadinessReportSnapshot,
  locale: ReportLocale,
): AiReportSummary {
  const texts = localizedDefaults(locale);
  const fitScorePct = Math.round(snapshot.readiness.fitScore * 100);
  const topStrengths = snapshot.skillBreakdown
    .slice()
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)
    .map(
      (item) =>
        `${item.competencyName} (${Math.round(item.matchScore * 100)}% match)`,
    );
  const topRisks = snapshot.detectedGaps
    .slice()
    .sort((a, b) => a.matchScore - b.matchScore)
    .slice(0, 3)
    .map((item) => `${item.competencyName} (${item.severity})`);

  return {
    executiveSummary: texts.mockExecutiveSummary(
      fitScorePct,
      snapshot.profileSummary.desiredRole,
      snapshot.profileSummary.targetCountry,
    ),
    topStrengths:
      topStrengths.length > 0
        ? topStrengths
        : [texts.mockNoStrengths],
    topRisks:
      topRisks.length > 0
        ? topRisks
        : [texts.mockNoRisks],
    recommendedStrategy: texts.mockStrategy,
    advisoryDisclaimer: texts.mockDisclaimer,
  };
}
