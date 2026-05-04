export interface TransferEdge {
  targetId: string;
  coefficient: number;
}

export interface SkillDemand {
  frequency: number;
  requiredLevel: number;
}

export interface SkillMatchResult {
  skillId: string;
  matchScore: number;
  weight: number;
  userLevel: number;
  requiredLevel: number;
  source: 'direct' | 'transferability';
}

export interface FitScoreResult {
  score: number;
  breakdown: SkillMatchResult[];
}

export interface GapItemInput {
  id: string;
  skillId: string;
  gapType: 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'EXPERIENCE';
  severity: 'CRITICAL' | 'MODERATE' | 'MINOR';
  currentLevel: number;
  requiredLevel: number;
  estimatedMonths: number;
  dependsOn: string[];
  orderIndex: number;
}

export interface RoadmapResult {
  orderedGaps: GapItemInput[];
  totalPrepMonths: number;
}

export type SkillCategoryType = 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'SOFT_SKILL';

export interface SkillMeta {
  category: SkillCategoryType;
  parentId: string | null;
}
