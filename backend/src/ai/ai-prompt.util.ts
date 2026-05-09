import { RelocationReadinessReportSnapshot } from '../reports/reports.types.js';
import { AiReportSummary } from './ai.types.js';

export function buildAiSummaryPrompt(snapshot: RelocationReadinessReportSnapshot): string {
  const payload = JSON.stringify(snapshot);
  return [
    'You are generating an advisory summary for a relocation readiness report.',
    'Use ONLY the snapshot JSON provided by the user. Do not invent facts.',
    'Keep deterministic metrics authoritative and unchanged.',
    'Return JSON with keys:',
    'executiveSummary (string, max 2 sentences),',
    'topStrengths (array of exactly 3 short strings),',
    'topRisks (array of exactly 3 short strings),',
    'recommendedStrategy (string, max 3 sentences),',
    'advisoryDisclaimer (string, 1 sentence noting advisory AI text).',
    'If data is missing, state limitations clearly but still return all keys.',
    '',
    `SNAPSHOT_JSON: ${payload}`,
  ].join('\n');
}

const sanitizeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? '').trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
};

export function parseAiSummaryJson(raw: string): AiReportSummary {
  const parsed = JSON.parse(raw) as Partial<AiReportSummary>;
  const executiveSummary = String(parsed.executiveSummary ?? '').trim();
  const recommendedStrategy = String(parsed.recommendedStrategy ?? '').trim();
  const advisoryDisclaimer =
    String(parsed.advisoryDisclaimer ?? '').trim() ||
    'AI-generated advisory text. Verify with deterministic report metrics.';
  const topStrengths = sanitizeList(parsed.topStrengths);
  const topRisks = sanitizeList(parsed.topRisks);

  if (!executiveSummary || !recommendedStrategy) {
    throw new Error('AI response is missing required summary fields');
  }

  return {
    executiveSummary,
    topStrengths:
      topStrengths.length > 0
        ? topStrengths
        : ['Core profile data is available but strengths could not be expanded.'],
    topRisks:
      topRisks.length > 0
        ? topRisks
        : ['Risk details were limited in the generated AI output.'],
    recommendedStrategy,
    advisoryDisclaimer,
  };
}

export function buildMockSummary(snapshot: RelocationReadinessReportSnapshot): AiReportSummary {
  const fitScorePct = Math.round(snapshot.readiness.fitScore * 100);
  const topStrengths = snapshot.skillBreakdown
    .slice()
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3)
    .map((item) => `${item.competencyName} (${Math.round(item.matchScore * 100)}% match)`);
  const topRisks = snapshot.detectedGaps
    .slice()
    .sort((a, b) => a.matchScore - b.matchScore)
    .slice(0, 3)
    .map((item) => `${item.competencyName} (${item.severity})`);

  return {
    executiveSummary: `Current readiness is ${fitScorePct}% for ${snapshot.profileSummary.desiredRole} in ${snapshot.profileSummary.targetCountry}. Focus should remain on prioritized roadmap execution.`,
    topStrengths:
      topStrengths.length > 0
        ? topStrengths
        : ['No strong competency matches were detected from snapshot data.'],
    topRisks:
      topRisks.length > 0
        ? topRisks
        : ['No critical risks were detected in actionable gaps.'],
    recommendedStrategy:
      'Address top roadmap items first, then re-run analysis after measurable progress to confirm risk reduction and fit-score improvement.',
    advisoryDisclaimer:
      'AI-generated advisory text. Deterministic fit score, gaps, and roadmap remain the source of truth.',
  };
}
