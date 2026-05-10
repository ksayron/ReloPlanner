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
