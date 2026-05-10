export type ResumeTextFormat = 'pdf' | 'txt' | 'docx';

export interface ResumeTextExtractionResult {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  format: ResumeTextFormat;
  text: string;
  characterCount: number;
}

export interface ResumeDraftField<T> {
  value: T | null;
  confidence: number;
}

export type ResumeLevelHint = 'NONE' | 'BASIC' | 'PRACTICAL' | 'CONFIDENT' | 'ADVANCED';

export interface ResumeSkillCandidate {
  name: string;
  confidence: number;
  levelHint: ResumeLevelHint;
}

export interface ResumeSkillUnmatched {
  name: string;
  confidence: number;
}

export type ResumeDraftCompetencyType =
  | 'HARD_SKILL'
  | 'LANGUAGE'
  | 'CERTIFICATION'
  | 'DOMAIN_KNOWLEDGE'
  | 'SOFT_SKILL';

export interface ResumeMappedCompetency {
  competencyId: string;
  competencyName: string;
  competencyType: ResumeDraftCompetencyType;
  confidence: number;
  hardSkillLevel?: 'NONE' | 'BASIC' | 'PRACTICAL' | 'CONFIDENT' | 'ADVANCED';
  languageLevel?: 'NONE' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  certificationStatus?: 'NONE' | 'PLANNED' | 'IN_PROGRESS' | 'OBTAINED' | 'EXPIRED';
}

export interface ResumeProfileDraft {
  desiredRole: ResumeDraftField<string>;
  yearsExperience: ResumeDraftField<number>;
  currentCountry: ResumeDraftField<string>;
  competencies: ResumeMappedCompetency[];
  unmatchedSkills: ResumeSkillUnmatched[];
  overallConfidence: number;
}
