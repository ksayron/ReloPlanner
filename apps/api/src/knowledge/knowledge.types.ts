export const KNOWLEDGE_CATEGORIES = [
  'VISA',
  'LEGAL',
  'COST',
  'JOB',
  'CV',
  'LANGUAGE',
  'HOUSING',
] as const;

export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

export const KNOWLEDGE_ACCESS_LEVELS = ['FREE', 'PREMIUM'] as const;
export type KnowledgeAccessLevel = (typeof KNOWLEDGE_ACCESS_LEVELS)[number];
