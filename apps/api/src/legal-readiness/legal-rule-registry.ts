import type {
  LegalKnowledgeRule,
  LegalReadinessFacts,
  RegionType,
} from './legal-readiness.types.js';

export const EU_COUNTRIES = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

const KNOWN_NON_EU_COUNTRIES = new Set([
  'UA',
  'GB',
  'UK',
  'CA',
  'US',
  'NO',
  'CH',
  'IS',
  'TR',
  'IN',
  'BR',
  'AU',
  'NZ',
  'JP',
  'KR',
  'IL',
  'SG',
  'MX',
  'ZA',
  'AE',
]);

export function normalizeCountryCode(value: string | undefined | null): string {
  return (value ?? '').trim().toUpperCase();
}

export function getRegionType(countryCodeRaw: string | undefined | null): RegionType {
  const countryCode = normalizeCountryCode(countryCodeRaw);
  if (!countryCode) return 'UNKNOWN';
  if (EU_COUNTRIES.has(countryCode)) return 'EU';
  if (KNOWN_NON_EU_COUNTRIES.has(countryCode)) return 'NON_EU';
  return 'UNKNOWN';
}

function looksLikeItRole(facts: LegalReadinessFacts): boolean {
  const role = (facts.desiredRole ?? '').trim().toLowerCase();
  if (!role) return false;
  return /it|software|developer|engineer|devops|frontend|backend|full\s*stack|qa|data|cloud|sre|architect/.test(
    role,
  );
}

export function buildLegalRuleRegistry(): LegalKnowledgeRule[] {
  return [
    {
      code: 'EU_INTERNAL_RELOCATION_BASELINE',
      description:
        'EU to EU relocation usually has lower visa complexity, but local administrative steps may still apply.',
      when: (facts) => facts.sourceRegion === 'EU' && facts.targetRegion === 'EU',
      then: () => ({
        riskLevel: 'LOW',
        visaCheckLikelyRequired: false,
        advice: [
          {
            code: 'EU_INTERNAL_ADMIN_STEPS',
            message:
              'Visa complexity appears lower for this country pair, but local registration, tax, and administrative steps may still apply.',
          },
          {
            code: 'VERIFY_COUNTRY_RULES',
            message:
              'Check official country-specific requirements before final relocation decisions.',
          },
        ],
        recommendedArticleSlugs: ['eu-internal-relocation-basics'],
      }),
    },
    {
      code: 'NON_EU_TO_EU_LEGAL_CHECK',
      description:
        'Non-EU to EU relocation usually requires legal/work authorization checks.',
      when: (facts) => facts.sourceRegion === 'NON_EU' && facts.targetRegion === 'EU',
      then: () => ({
        riskLevel: 'HIGH',
        visaCheckLikelyRequired: true,
        questions: [
          {
            key: 'hasExistingWorkAuthorization',
            text: 'Do you already have valid work authorization or residence rights for the target country?',
            type: 'BOOLEAN',
            priority: 'HIGH',
          },
          {
            key: 'hasJobOffer',
            text: 'Do you already have a confirmed job offer from an employer in the target country?',
            type: 'BOOLEAN',
            priority: 'HIGH',
          },
          {
            key: 'hasRecognizedDegree',
            text: 'Do you have a recognized university degree or comparable qualification?',
            type: 'BOOLEAN',
            priority: 'MEDIUM',
          },
        ],
        possibleRoutes: [
          {
            code: 'SKILLED_WORKER_ROUTE',
            title: 'Skilled worker route',
            applicability: 'POSSIBLE',
            description:
              'May be relevant if you receive a qualifying job offer and meet local qualification requirements.',
          },
        ],
        warnings: [
          {
            code: 'LEGAL_TIMELINE_RISK',
            severity: 'HIGH',
            message:
              'Legal preparation may significantly affect relocation timeline. Verify requirements using official sources.',
          },
        ],
        advice: [
          {
            code: 'VERIFY_OFFICIAL_REQUIREMENTS',
            message:
              'Check official visa and work authorization requirements before making relocation decisions.',
          },
        ],
        recommendedArticleSlugs: [
          'non-eu-to-eu-relocation-checklist',
          'work-authorization-basics',
        ],
      }),
    },
    {
      code: 'EXISTING_WORK_AUTHORIZATION_REDUCES_RISK',
      description:
        'Existing work authorization can reduce uncertainty, but scope and duration must be verified.',
      when: (facts) => facts.hasExistingWorkAuthorization === true,
      then: () => ({
        riskShift: -1,
        advice: [
          {
            code: 'VERIFY_AUTHORIZATION_VALIDITY',
            message:
              'Verify authorization validity, duration, target-country scope, and permitted work rights.',
          },
        ],
      }),
    },
    {
      code: 'NO_JOB_OFFER_WORK_ROUTE_UNCERTAINTY',
      description:
        'Without a confirmed job offer, work-based relocation routes may be less predictable.',
      when: (facts) => facts.targetRegion === 'EU' && facts.hasJobOffer === false,
      then: () => ({
        riskShift: 1,
        warnings: [
          {
            code: 'NO_JOB_OFFER_WARNING',
            severity: 'HIGH',
            message:
              'Work-based relocation routes may be uncertain without a confirmed employer/job offer.',
          },
        ],
        advice: [
          {
            code: 'JOB_OFFER_IMPORTANCE',
            message:
              'If you plan a work-based route, prioritize obtaining a concrete offer and checking official conditions.',
          },
        ],
      }),
    },
    {
      code: 'GERMANY_BLUE_CARD_CANDIDATE_SIGNAL',
      description:
        'Germany route signal: a Blue Card path may be worth checking for qualified employment.',
      when: (facts) =>
        normalizeCountryCode(facts.targetCountry) === 'DE' &&
        facts.hasJobOffer === true &&
        (facts.hasRecognizedDegree === true || facts.hasFormalEducation === true),
      then: () => ({
        possibleRoutes: [
          {
            code: 'EU_BLUE_CARD_CANDIDATE',
            title: 'EU Blue Card candidate',
            applicability: 'POSSIBLE',
            description:
              'May be relevant for qualified professionals with a concrete job offer and salary conditions. Verify official requirements.',
          },
        ],
        advice: [
          {
            code: 'GERMANY_BLUE_CARD_VERIFY',
            message:
              'For Germany, verify Blue Card qualification, offer, and salary conditions via official sources.',
          },
        ],
        recommendedArticleSlugs: ['germany-blue-card-overview'],
      }),
    },
    {
      code: 'GERMANY_IT_SPECIAL_CASE_SIGNAL',
      description:
        'Germany IT special-case signal when there is an IT role and offer but no recognized degree.',
      when: (facts) =>
        normalizeCountryCode(facts.targetCountry) === 'DE' &&
        looksLikeItRole(facts) &&
        facts.hasJobOffer === true &&
        facts.hasRecognizedDegree === false,
      then: () => ({
        possibleRoutes: [
          {
            code: 'IT_PROFESSIONAL_SPECIAL_CASE',
            title: 'IT professional special case',
            applicability: 'POSSIBLE',
            description:
              'May be worth checking for certain IT professionals without a traditional degree. Official conditions still apply.',
          },
        ],
        warnings: [
          {
            code: 'SPECIAL_CASE_IS_NOT_GUARANTEE',
            severity: 'MEDIUM',
            message:
              'This is only a potential route signal and not an eligibility confirmation.',
          },
        ],
        recommendedArticleSlugs: ['germany-it-specialist-visa-options'],
      }),
    },
    {
      code: 'FAMILY_RELOCATION_COMPLEXITY',
      description:
        'Relocation with family can add dependent-document and residence complexity.',
      when: (facts) => facts.relocationWithFamily === true,
      then: () => ({
        riskLevel: 'MODERATE',
        questions: [
          {
            key: 'hasFamilyDocumentsPrepared',
            text: 'Do you already have key family/dependent documents prepared for legal processing?',
            type: 'BOOLEAN',
            priority: 'MEDIUM',
          },
          {
            key: 'hasCheckedDependentResidenceRules',
            text: 'Have you checked dependent residence and work-right rules for your target country?',
            type: 'BOOLEAN',
            priority: 'MEDIUM',
          },
        ],
        warnings: [
          {
            code: 'FAMILY_COMPLEXITY_WARNING',
            severity: 'MEDIUM',
            message:
              'Family relocation can introduce additional legal and document requirements.',
          },
        ],
        advice: [
          {
            code: 'FAMILY_RULES_VERIFY',
            message:
              'Verify dependent residence rules and required documents using official sources.',
          },
        ],
        recommendedArticleSlugs: ['family-relocation-basics'],
      }),
    },
    {
      code: 'UNKNOWN_COUNTRY_FALLBACK',
      description:
        'Unknown country pair fallback when one of countries is not recognized by the current region map.',
      when: (facts) =>
        facts.sourceRegion === 'UNKNOWN' || facts.targetRegion === 'UNKNOWN',
      then: () => ({
        riskLevel: 'UNKNOWN',
        visaCheckLikelyRequired: true,
        warnings: [
          {
            code: 'UNSUPPORTED_COUNTRY_PAIR',
            severity: 'MEDIUM',
            message:
              'Country pair is not fully supported by the current legal-readiness rule set.',
          },
        ],
        advice: [
          {
            code: 'OFFICIAL_SOURCE_REQUIRED',
            message:
              'Verify official visa and work authorization requirements directly from government sources.',
          },
        ],
        recommendedArticleSlugs: ['official-visa-source-checklist'],
      }),
    },
  ];
}
