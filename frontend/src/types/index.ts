export type Role = 'USER' | 'PREMIUM' | 'ADMIN';
export type SkillCategory = 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'SOFT_SKILL';
export type GapType = 'HARD_SKILL' | 'LANGUAGE' | 'CERTIFICATION' | 'EXPERIENCE';
export type Severity = 'CRITICAL' | 'MODERATE' | 'MINOR';
export type GapStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
export type CostCategory = 'RENT' | 'FOOD' | 'TRANSPORT' | 'UTILITIES' | 'OTHER';

export interface User {
  id: string;
  email: string;
  role: Role;
}

export interface AuthPayload {
  access_token: string;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  parentId: string | null;
  children?: Skill[];
  aliases?: { id: string; alias: string }[];
}

export interface UserSkill {
  skillId: string;
  proficiency: number;
  skill?: Skill;
}

export interface RelocationProfile {
  id: string;
  targetCountry: string;
  targetCity?: string;
  currentCountry: string;
  yearsExperience: number;
  desiredRole: string;
  skills: UserSkill[];
}

export interface SkillMatchResult {
  skillId: string;
  matchScore: number;
  weight: number;
  userLevel: number;
  requiredLevel: number;
  source: 'direct' | 'transferability';
}

export interface GapItem {
  id: string;
  skillId: string;
  gapType: GapType;
  severity: Severity;
  currentLevel: number;
  requiredLevel: number;
  estimatedMonths: number;
  dependsOn: string[];
  orderIndex: number;
  status: GapStatus;
  skill?: Skill;
}

export interface AnalysisResult {
  id: string;
  fitScore: number;
  skillBreakdown: SkillMatchResult[];
  totalPrepMonths: number;
  createdAt: string;
  gaps: GapItem[];
}

export interface CostComparison {
  city1: string;
  city2: string;
  comparison: { category: CostCategory; city1Amount: number; city2Amount: number }[];
}
