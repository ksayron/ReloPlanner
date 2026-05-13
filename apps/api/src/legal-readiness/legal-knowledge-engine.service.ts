import { Injectable } from '@nestjs/common';
import { EvaluateLegalReadinessDto } from './legal-readiness.dto.js';
import {
  buildLegalRuleRegistry,
  getRegionType,
  normalizeCountryCode,
} from './legal-rule-registry.js';
import type {
  LegalAdvice,
  LegalQuestion,
  LegalReadinessFacts,
  LegalReadinessResult,
  LegalRiskLevel,
  LegalRoute,
  LegalRuleResult,
  LegalWarning,
} from './legal-readiness.types.js';

const DISCLAIMER_TEXT =
  'This section is for informational guidance only and is not legal advice. Always verify requirements with official government sources or qualified legal professionals.';

@Injectable()
export class LegalKnowledgeEngineService {
  evaluate(input: EvaluateLegalReadinessDto): LegalReadinessResult {
    const facts = this.toFacts(input);
    const rules = buildLegalRuleRegistry();

    const triggeredRules: Array<{ code: string; description: string }> = [];
    const results: LegalRuleResult[] = [];

    for (const rule of rules) {
      if (!rule.when(facts)) {
        continue;
      }

      const raw = rule.then(facts);
      triggeredRules.push({ code: rule.code, description: rule.description });
      results.push({
        ruleCode: rule.code,
        ...raw,
      });
    }

    const overallRisk = this.resolveOverallRisk(facts, results);
    const visaCheckLikelyRequired = this.resolveVisaCheckRequired(
      facts,
      results,
    );

    return {
      sourceCountry: facts.sourceCountry,
      targetCountry: facts.targetCountry,
      sourceRegion: facts.sourceRegion,
      targetRegion: facts.targetRegion,
      visaCheckLikelyRequired,
      overallRisk,
      triggeredRules,
      questions: this.uniqueByKey(
        results.flatMap((x) => x.questions ?? []),
        (x) => x.key,
      ),
      possibleRoutes: this.uniqueByKey(
        results.flatMap((x) => x.possibleRoutes ?? []),
        (x) => x.code,
      ),
      warnings: this.uniqueByKey(
        results.flatMap((x) => x.warnings ?? []),
        (x) => x.code,
      ),
      advice: this.uniqueByKey(
        results.flatMap((x) => x.advice ?? []),
        (x) => x.code,
      ),
      recommendedArticleSlugs: this.uniqueValues(
        results.flatMap((x) => x.recommendedArticleSlugs ?? []),
      ),
      disclaimer: DISCLAIMER_TEXT,
    };
  }

  private toFacts(input: EvaluateLegalReadinessDto): LegalReadinessFacts {
    const sourceCountry = normalizeCountryCode(input.sourceCountry);
    const targetCountry = normalizeCountryCode(input.targetCountry);
    return {
      sourceCountry,
      targetCountry,
      sourceRegion: getRegionType(sourceCountry),
      targetRegion: getRegionType(targetCountry),
      targetCity: input.targetCity ?? null,
      desiredRole: input.desiredRole ?? null,
      hasExistingWorkAuthorization:
        typeof input.hasExistingWorkAuthorization === 'boolean'
          ? input.hasExistingWorkAuthorization
          : null,
      hasJobOffer:
        typeof input.hasJobOffer === 'boolean' ? input.hasJobOffer : null,
      hasRecognizedDegree:
        typeof input.hasRecognizedDegree === 'boolean'
          ? input.hasRecognizedDegree
          : null,
      hasFormalEducation:
        typeof input.hasFormalEducation === 'boolean'
          ? input.hasFormalEducation
          : null,
      targetSalaryGrossAnnual:
        typeof input.targetSalaryGrossAnnual === 'number'
          ? input.targetSalaryGrossAnnual
          : null,
      relocationWithFamily:
        typeof input.relocationWithFamily === 'boolean'
          ? input.relocationWithFamily
          : null,
      hasFamilyDocumentsPrepared:
        typeof input.hasFamilyDocumentsPrepared === 'boolean'
          ? input.hasFamilyDocumentsPrepared
          : null,
      hasCheckedDependentResidenceRules:
        typeof input.hasCheckedDependentResidenceRules === 'boolean'
          ? input.hasCheckedDependentResidenceRules
          : null,
    };
  }

  private resolveOverallRisk(
    facts: LegalReadinessFacts,
    results: LegalRuleResult[],
  ): LegalRiskLevel {
    const baseLevels = results
      .map((x) => x.riskLevel)
      .filter((x): x is LegalRiskLevel => Boolean(x));

    if (baseLevels.includes('UNKNOWN')) {
      return 'UNKNOWN';
    }

    let score = this.riskLevelToScore(
      baseLevels.reduce<LegalRiskLevel>(
        (current, value) =>
          this.riskLevelToScore(value) > this.riskLevelToScore(current)
            ? value
            : current,
        'LOW',
      ),
    );

    const shift = results.reduce((acc, item) => acc + (item.riskShift ?? 0), 0);
    score = this.clampScore(score + shift);

    if (facts.relocationWithFamily === true && score < 2) {
      score = 2;
    }

    return this.scoreToRiskLevel(score);
  }

  private resolveVisaCheckRequired(
    facts: LegalReadinessFacts,
    results: LegalRuleResult[],
  ): boolean {
    const explicitSignals = results
      .map((x) => x.visaCheckLikelyRequired)
      .filter((x): x is boolean => typeof x === 'boolean');

    if (explicitSignals.includes(true)) {
      return true;
    }
    if (explicitSignals.includes(false)) {
      return false;
    }

    if (facts.sourceRegion === 'UNKNOWN' || facts.targetRegion === 'UNKNOWN') {
      return true;
    }

    return facts.sourceRegion === 'NON_EU' && facts.targetRegion === 'EU';
  }

  private riskLevelToScore(level: LegalRiskLevel): number {
    if (level === 'HIGH') return 3;
    if (level === 'MODERATE') return 2;
    if (level === 'LOW') return 1;
    return 0;
  }

  private scoreToRiskLevel(score: number): LegalRiskLevel {
    if (score >= 3) return 'HIGH';
    if (score === 2) return 'MODERATE';
    if (score <= 0) return 'LOW';
    return 'LOW';
  }

  private clampScore(score: number): number {
    if (score < 1) return 1;
    if (score > 3) return 3;
    return score;
  }

  private uniqueValues(values: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];
    for (const value of values) {
      if (!value || seen.has(value)) continue;
      seen.add(value);
      output.push(value);
    }
    return output;
  }

  private uniqueByKey<T>(values: T[], keySelector: (value: T) => string): T[] {
    const seen = new Set<string>();
    const output: T[] = [];
    for (const value of values) {
      const key = keySelector(value);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      output.push(value);
    }
    return output;
  }
}
