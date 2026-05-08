import 'dotenv/config';
import {
  PrismaClient,
  SkillCategory,
  CostCategory,
  Role,
  CompetencyType,
  RequirementPriority,
  RoleRelevance,
  CountryLanguageRelevance,
  HardSkillLevel,
  LanguageLevel,
  CertificationStatus,
  CertificationRequirementLevel,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SUPPORTED_COUNTRIES = ['DE', 'NL', 'CA', 'GB', 'PL'] as const;

const ROLE_LIST = [
  'Frontend Developer',
  'Backend Developer',
  'Full-Stack Developer',
  'DevOps Engineer',
  'Data Scientist',
  'Data Engineer',
  'Mobile Developer',
  'QA Engineer',
  'Software Architect',
  'Engineering Manager',
] as const;

type RoleName = (typeof ROLE_LIST)[number];
type RulePack = {
  core: string[];
  important: string[];
  optional: string[];
  contextual: string[];
};

const ROLE_REQUIREMENTS: Record<RoleName, RulePack> = {
  'Frontend Developer': {
    core: ['JavaScript', 'TypeScript', 'React', 'REST API', 'Git'],
    important: ['Node.js', 'English', 'CI/CD'],
    optional: ['Vue', 'Angular', 'GraphQL'],
    contextual: ['Docker', 'Java', 'Go'],
  },
  'Backend Developer': {
    core: ['Node.js', 'REST API', 'PostgreSQL', 'Git', 'Linux'],
    important: ['TypeScript', 'Docker', 'CI/CD', 'English'],
    optional: ['GraphQL', 'Redis', 'Kubernetes'],
    contextual: ['React', 'Angular', 'Spanish'],
  },
  'Full-Stack Developer': {
    core: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'REST API', 'Git'],
    important: ['PostgreSQL', 'Docker', 'English', 'CI/CD'],
    optional: ['GraphQL', 'Redis', 'AWS'],
    contextual: ['Go', 'French', 'Kubernetes'],
  },
  'DevOps Engineer': {
    core: ['Linux', 'Docker', 'Kubernetes', 'CI/CD', 'Terraform', 'Git'],
    important: [
      'AWS',
      'Azure',
      'Python',
      'Monitoring',
      'Logging',
      'English',
      'Networking',
      'Bash',
    ],
    optional: ['Node.js', 'Go', 'PostgreSQL', 'AWS Certified'],
    contextual: ['React', 'Angular', 'French', 'Spanish', 'Java', 'C#'],
  },
  'Data Scientist': {
    core: ['Python', 'SQL', 'Git', 'English'],
    important: ['Docker', 'AWS', 'PostgreSQL'],
    optional: ['Kubernetes', 'Go'],
    contextual: ['React', 'Angular', 'French'],
  },
  'Data Engineer': {
    core: ['Python', 'SQL', 'PostgreSQL', 'Docker', 'Git'],
    important: ['AWS', 'CI/CD', 'Linux', 'English'],
    optional: ['Kubernetes', 'Terraform', 'Monitoring'],
    contextual: ['React', 'Spanish', 'Angular'],
  },
  'Mobile Developer': {
    core: ['JavaScript', 'TypeScript', 'Git', 'REST API'],
    important: ['Node.js', 'English', 'CI/CD'],
    optional: ['React', 'GraphQL', 'AWS'],
    contextual: ['Kubernetes', 'French', 'Terraform'],
  },
  'QA Engineer': {
    core: ['Git', 'REST API', 'English'],
    important: ['JavaScript', 'TypeScript', 'CI/CD'],
    optional: ['Docker', 'PostgreSQL', 'Linux'],
    contextual: ['React', 'Angular', 'Spanish'],
  },
  'Software Architect': {
    core: ['Java', 'Node.js', 'PostgreSQL', 'REST API', 'Git', 'English'],
    important: ['Docker', 'Kubernetes', 'AWS', 'CI/CD'],
    optional: ['Terraform', 'Monitoring'],
    contextual: ['French', 'Spanish'],
  },
  'Engineering Manager': {
    core: ['English', 'Git'],
    important: ['System Design', 'CI/CD', 'AWS'],
    optional: ['German', 'French'],
    contextual: ['Angular', 'React', 'Kubernetes'],
  },
};

const FAMILY_BY_SKILL: Record<string, string> = {
  JavaScript: 'frontend',
  TypeScript: 'frontend',
  React: 'frontend',
  Angular: 'frontend',
  Vue: 'frontend',
  'Node.js': 'backend_runtime',
  Express: 'backend_framework',
  NestJS: 'backend_framework',
  Python: 'scripting',
  Java: 'backend',
  'C#': 'backend',
  Go: 'backend',
  Django: 'backend_framework',
  'Spring Boot': 'backend_framework',
  PostgreSQL: 'databases',
  MySQL: 'databases',
  MongoDB: 'databases',
  Redis: 'databases',
  Docker: 'containers',
  Kubernetes: 'orchestration',
  Terraform: 'infrastructure_as_code',
  Linux: 'operating_systems',
  'CI/CD': 'ci_cd',
  AWS: 'cloud',
  Azure: 'cloud',
  Monitoring: 'monitoring',
  Logging: 'logging',
  Networking: 'networking',
  Bash: 'scripting',
  SQL: 'databases',
  Git: 'version_control',
  'REST API': 'backend',
  GraphQL: 'backend',
  English: 'language',
  German: 'language',
  French: 'language',
  Spanish: 'language',
  Polish: 'language',
  'AWS Certified': 'cloud_certification',
  'Azure Certified': 'cloud_certification',
  IELTS: 'language_certification',
  'Goethe-Zertifikat': 'language_certification',
  'System Design': 'architecture',
};

const CATEGORY_TO_TYPE: Record<SkillCategory, CompetencyType> = {
  HARD_SKILL: 'HARD_SKILL',
  LANGUAGE: 'LANGUAGE',
  CERTIFICATION: 'CERTIFICATION',
  SOFT_SKILL: 'SOFT_SKILL',
};

const PRIORITY_MULTIPLIER: Record<RequirementPriority, number> = {
  CORE: 1,
  IMPORTANT: 0.8,
  OPTIONAL: 0.5,
  CONTEXTUAL: 0.3,
};

function roleRelevanceFromPriority(
  priority: RequirementPriority,
): RoleRelevance {
  switch (priority) {
    case 'CORE':
      return 'CORE';
    case 'IMPORTANT':
      return 'RELATED';
    case 'OPTIONAL':
      return 'WEAKLY_RELATED';
    case 'CONTEXTUAL':
    default:
      return 'WEAKLY_RELATED';
  }
}

function hardSkillLevelScore(level: HardSkillLevel | null): number {
  const map: Record<HardSkillLevel, number> = {
    NONE: 0,
    BASIC: 0.25,
    PRACTICAL: 0.5,
    CONFIDENT: 0.75,
    ADVANCED: 1,
  };
  return level ? map[level] : 0;
}

async function main() {
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@reloplanner.dev' },
    update: { passwordHash: adminHash, role: Role.ADMIN },
    create: {
      email: 'admin@reloplanner.dev',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  const skills: {
    name: string;
    category: SkillCategory;
    parentName?: string;
  }[] = [
    { name: 'JavaScript', category: 'HARD_SKILL' },
    { name: 'TypeScript', category: 'HARD_SKILL', parentName: 'JavaScript' },
    { name: 'Python', category: 'HARD_SKILL' },
    { name: 'Java', category: 'HARD_SKILL' },
    { name: 'C#', category: 'HARD_SKILL' },
    { name: 'Go', category: 'HARD_SKILL' },
    { name: 'React', category: 'HARD_SKILL' },
    { name: 'Angular', category: 'HARD_SKILL' },
    { name: 'Vue', category: 'HARD_SKILL' },
    { name: 'Node.js', category: 'HARD_SKILL' },
    { name: 'Express', category: 'HARD_SKILL', parentName: 'Node.js' },
    { name: 'NestJS', category: 'HARD_SKILL', parentName: 'Express' },
    { name: 'Django', category: 'HARD_SKILL' },
    { name: 'Spring Boot', category: 'HARD_SKILL' },
    { name: 'PostgreSQL', category: 'HARD_SKILL' },
    { name: 'MySQL', category: 'HARD_SKILL' },
    { name: 'MongoDB', category: 'HARD_SKILL' },
    { name: 'Redis', category: 'HARD_SKILL' },
    { name: 'Docker', category: 'HARD_SKILL' },
    { name: 'Kubernetes', category: 'HARD_SKILL', parentName: 'Docker' },
    { name: 'Terraform', category: 'HARD_SKILL' },
    { name: 'Linux', category: 'HARD_SKILL' },
    { name: 'CI/CD', category: 'HARD_SKILL' },
    { name: 'AWS', category: 'HARD_SKILL' },
    { name: 'Azure', category: 'HARD_SKILL' },
    { name: 'Monitoring', category: 'HARD_SKILL' },
    { name: 'Logging', category: 'HARD_SKILL' },
    { name: 'Networking', category: 'HARD_SKILL' },
    { name: 'Bash', category: 'HARD_SKILL' },
    { name: 'SQL', category: 'HARD_SKILL' },
    { name: 'Git', category: 'HARD_SKILL' },
    { name: 'REST API', category: 'HARD_SKILL' },
    { name: 'GraphQL', category: 'HARD_SKILL' },
    { name: 'System Design', category: 'SOFT_SKILL' },
    { name: 'English', category: 'LANGUAGE' },
    { name: 'German', category: 'LANGUAGE' },
    { name: 'French', category: 'LANGUAGE' },
    { name: 'Spanish', category: 'LANGUAGE' },
    { name: 'Polish', category: 'LANGUAGE' },
    { name: 'AWS Certified', category: 'CERTIFICATION' },
    { name: 'Azure Certified', category: 'CERTIFICATION' },
    { name: 'IELTS', category: 'CERTIFICATION' },
    { name: 'Goethe-Zertifikat', category: 'CERTIFICATION' },
  ];

  const skillMap = new Map<string, string>();
  for (const s of skills.filter((x) => !x.parentName)) {
    const created = await prisma.skill.upsert({
      where: { name: s.name },
      update: { category: s.category },
      create: { name: s.name, category: s.category },
    });
    skillMap.set(s.name, created.id);
  }

  for (const s of skills.filter((x) => x.parentName)) {
    const parentId = skillMap.get(s.parentName!);
    const created = await prisma.skill.upsert({
      where: { name: s.name },
      update: { category: s.category, parentId },
      create: { name: s.name, category: s.category, parentId },
    });
    skillMap.set(s.name, created.id);
  }

  const aliases: [string, string][] = [
    ['JS', 'JavaScript'],
    ['TS', 'TypeScript'],
    ['k8s', 'Kubernetes'],
    ['Postgres', 'PostgreSQL'],
    ['Mongo', 'MongoDB'],
    ['node', 'Node.js'],
    ['iac', 'Terraform'],
  ];
  for (const [alias, skillName] of aliases) {
    const skillId = skillMap.get(skillName)!;
    await prisma.skillAlias.upsert({
      where: { alias },
      update: { skillId },
      create: { alias, skillId },
    });
  }

  const transfers: [string, string, number][] = [
    ['C#', 'Java', 0.65],
    ['JavaScript', 'TypeScript', 0.8],
    ['React', 'Vue', 0.6],
    ['PostgreSQL', 'MySQL', 0.75],
    ['Docker', 'Kubernetes', 0.35],
    ['AWS', 'Azure', 0.6],
    ['Python', 'Go', 0.35],
  ];
  for (const [src, tgt, coeff] of transfers) {
    const sourceSkillId = skillMap.get(src)!;
    const targetSkillId = skillMap.get(tgt)!;
    await prisma.skillTransferability.upsert({
      where: { sourceSkillId_targetSkillId: { sourceSkillId, targetSkillId } },
      update: { coefficient: coeff },
      create: { sourceSkillId, targetSkillId, coefficient: coeff },
    });
  }

  const competencyMap = new Map<string, string>();
  for (const s of skills) {
    const skillId = skillMap.get(s.name)!;
    const competency = await prisma.competency.upsert({
      where: { name: s.name },
      update: {
        type: CATEGORY_TO_TYPE[s.category],
        family: FAMILY_BY_SKILL[s.name] ?? 'general',
        legacySkillId: skillId,
      },
      create: {
        name: s.name,
        type: CATEGORY_TO_TYPE[s.category],
        family: FAMILY_BY_SKILL[s.name] ?? 'general',
        legacySkillId: skillId,
      },
    });
    competencyMap.set(s.name, competency.id);
  }

  for (const s of skills.filter((x) => x.parentName)) {
    await prisma.competency.update({
      where: { name: s.name },
      data: { parentId: competencyMap.get(s.parentName!) ?? null },
    });
  }

  const languageNames = [
    'English',
    'German',
    'French',
    'Spanish',
    'Polish',
  ] as const;
  const countryLanguageMap: Record<
    string,
    Partial<Record<(typeof languageNames)[number], CountryLanguageRelevance>>
  > = {
    DE: {
      German: 'PRIMARY',
      English: 'BUSINESS_COMMON',
      French: 'IRRELEVANT',
      Spanish: 'IRRELEVANT',
      Polish: 'MINORITY',
    },
    NL: {
      English: 'BUSINESS_COMMON',
      German: 'MINORITY',
      French: 'MINORITY',
      Spanish: 'MINORITY',
      Polish: 'MINORITY',
    },
    CA: {
      English: 'PRIMARY',
      French: 'BUSINESS_COMMON',
      German: 'IRRELEVANT',
      Spanish: 'MINORITY',
      Polish: 'IRRELEVANT',
    },
    GB: {
      English: 'PRIMARY',
      German: 'MINORITY',
      French: 'MINORITY',
      Spanish: 'MINORITY',
      Polish: 'IRRELEVANT',
    },
    PL: {
      Polish: 'PRIMARY',
      English: 'BUSINESS_COMMON',
      German: 'MINORITY',
      French: 'IRRELEVANT',
      Spanish: 'IRRELEVANT',
    },
  };

  for (const country of SUPPORTED_COUNTRIES) {
    for (const lang of languageNames) {
      const relevance = countryLanguageMap[country]?.[lang] ?? 'IRRELEVANT';
      await prisma.countryLanguage.upsert({
        where: {
          countryCode_languageCompetencyId: {
            countryCode: country,
            languageCompetencyId: competencyMap.get(lang)!,
          },
        },
        update: { relevance },
        create: {
          countryCode: country,
          languageCompetencyId: competencyMap.get(lang)!,
          relevance,
        },
      });
    }
  }

  const familyRuleMap = new Map<
    string,
    {
      role: string;
      family: string;
      relevance: RoleRelevance;
      priority: RequirementPriority;
    }
  >();
  for (const role of ROLE_LIST) {
    const rolePack = ROLE_REQUIREMENTS[role];
    const rows: [RequirementPriority, string[]][] = [
      ['CORE', rolePack.core],
      ['IMPORTANT', rolePack.important],
      ['OPTIONAL', rolePack.optional],
      ['CONTEXTUAL', rolePack.contextual],
    ];

    for (const [priority, names] of rows) {
      for (const competencyName of names) {
        const family = FAMILY_BY_SKILL[competencyName] ?? 'general';
        const relevance = roleRelevanceFromPriority(priority);
        familyRuleMap.set(`${role}|${family}`, {
          role,
          family,
          relevance,
          priority,
        });
      }
    }
  }

  for (const entry of familyRuleMap.values()) {
    await prisma.roleCompetencyRule.upsert({
      where: {
        roleName_competencyFamily: {
          roleName: entry.role,
          competencyFamily: entry.family,
        },
      },
      update: {
        defaultRelevance: entry.relevance,
        defaultPriority: entry.priority,
      },
      create: {
        roleName: entry.role,
        competencyFamily: entry.family,
        defaultRelevance: entry.relevance,
        defaultPriority: entry.priority,
      },
    });
  }

  const deSnapshotDate = new Date('2025-01-01');
  let deSnapshot = await prisma.marketSnapshot.findFirst({
    where: { country: 'DE', source: 'manual', snapshotDate: deSnapshotDate },
  });
  if (!deSnapshot) {
    deSnapshot = await prisma.marketSnapshot.create({
      data: {
        country: 'DE',
        city: 'Berlin',
        snapshotDate: deSnapshotDate,
        source: 'manual',
        totalVacancies: 15000,
      },
    });
  }

  for (const country of SUPPORTED_COUNTRIES) {
    for (const role of ROLE_LIST) {
      const pack = ROLE_REQUIREMENTS[role];
      const rows: [RequirementPriority, string[]][] = [
        ['CORE', pack.core],
        ['IMPORTANT', pack.important],
        ['OPTIONAL', pack.optional],
        ['CONTEXTUAL', pack.contextual],
      ];

      for (const [priority, names] of rows) {
        for (const competencyName of names) {
          const competencyId = competencyMap.get(competencyName);
          if (!competencyId) continue;

          const skillType =
            skills.find((s) => s.name === competencyName)?.category ??
            'HARD_SKILL';
          const competencyType = CATEGORY_TO_TYPE[skillType];
          const baseFrequency =
            priority === 'CORE'
              ? 0.45
              : priority === 'IMPORTANT'
                ? 0.3
                : priority === 'OPTIONAL'
                  ? 0.15
                  : 0.08;
          const importance = PRIORITY_MULTIPLIER[priority];

          let hardSkillRequiredLevel: HardSkillLevel | null = null;
          let languageRequiredLevel: LanguageLevel | null = null;
          let certificationRequirementLevel: CertificationRequirementLevel | null =
            null;
          let requiredCertificationStatus: CertificationStatus | null = null;
          let languageContext: any = null;

          if (
            competencyType === 'HARD_SKILL' ||
            competencyType === 'SOFT_SKILL'
          ) {
            hardSkillRequiredLevel =
              priority === 'CORE'
                ? 'CONFIDENT'
                : priority === 'IMPORTANT'
                  ? 'PRACTICAL'
                  : priority === 'OPTIONAL'
                    ? 'BASIC'
                    : 'BASIC';
          } else if (competencyType === 'LANGUAGE') {
            if (competencyName === 'English') {
              languageRequiredLevel = 'B2';
              languageContext = 'JOB_MARKET';
            } else if (country === 'DE' && competencyName === 'German') {
              languageRequiredLevel = 'A2';
              languageContext = 'RELOCATION_ADAPTATION';
            } else if (country === 'PL' && competencyName === 'Polish') {
              languageRequiredLevel = 'A2';
              languageContext = 'RELOCATION_ADAPTATION';
            } else {
              languageRequiredLevel = priority === 'CONTEXTUAL' ? 'A1' : 'A2';
              languageContext = 'OPTIONAL_ADVANTAGE';
            }
          } else if (competencyType === 'CERTIFICATION') {
            certificationRequirementLevel =
              priority === 'CORE'
                ? 'REQUIRED'
                : priority === 'IMPORTANT'
                  ? 'PREFERRED'
                  : 'OPTIONAL';
            requiredCertificationStatus = 'OBTAINED';
          }

          await prisma.marketRequirement.upsert({
            where: {
              countryCode_roleName_competencyId: {
                countryCode: country,
                roleName: role,
                competencyId,
              },
            },
            update: {
              competencyType,
              hardSkillRequiredLevel,
              languageRequiredLevel,
              certificationRequirementLevel,
              requiredCertificationStatus,
              priority,
              roleRelevance: roleRelevanceFromPriority(priority),
              languageContext,
              frequency: baseFrequency,
              importance,
              isActive: true,
              snapshotId: country === 'DE' ? deSnapshot.id : null,
            },
            create: {
              snapshotId: country === 'DE' ? deSnapshot.id : null,
              countryCode: country,
              roleName: role,
              competencyId,
              competencyType,
              hardSkillRequiredLevel,
              languageRequiredLevel,
              certificationRequirementLevel,
              requiredCertificationStatus,
              priority,
              roleRelevance: roleRelevanceFromPriority(priority),
              languageContext,
              frequency: baseFrequency,
              importance,
              isActive: true,
            },
          });
        }
      }
    }
  }

  for (const [name, competencyId] of competencyMap.entries()) {
    const type = skills.find((x) => x.name === name)?.category;
    if (type === 'HARD_SKILL' || type === 'SOFT_SKILL') {
      const levels: [HardSkillLevel, number][] = [
        ['BASIC', 40],
        ['PRACTICAL', 100],
        ['CONFIDENT', 180],
        ['ADVANCED', 350],
      ];
      for (const [level, hours] of levels) {
        await prisma.learningEffortProfile.upsert({
          where: {
            competencyId_targetLevel: { competencyId, targetLevel: level },
          },
          update: { estimatedHours: hours },
          create: { competencyId, targetLevel: level, estimatedHours: hours },
        });
      }
      continue;
    }

    if (type === 'LANGUAGE') {
      const levels: [LanguageLevel, number][] = [
        ['A1', 80],
        ['A2', 180],
        ['B1', 340],
        ['B2', 560],
        ['C1', 860],
      ];
      for (const [level, hours] of levels) {
        await prisma.learningEffortProfile.upsert({
          where: {
            competencyId_targetLevel: { competencyId, targetLevel: level },
          },
          update: { estimatedHours: hours },
          create: { competencyId, targetLevel: level, estimatedHours: hours },
        });
      }
      continue;
    }

    if (type === 'CERTIFICATION') {
      await prisma.learningEffortProfile.upsert({
        where: {
          competencyId_targetLevel: { competencyId, targetLevel: 'OBTAINED' },
        },
        update: { estimatedHours: 60 },
        create: { competencyId, targetLevel: 'OBTAINED', estimatedHours: 60 },
      });
    }
  }

  const demands: [string, number, number][] = [
    ['Docker', 0.4, hardSkillLevelScore('PRACTICAL')],
    ['Kubernetes', 0.25, hardSkillLevelScore('PRACTICAL')],
    ['AWS', 0.35, hardSkillLevelScore('PRACTICAL')],
    ['Linux', 0.45, hardSkillLevelScore('CONFIDENT')],
    ['Git', 0.7, hardSkillLevelScore('PRACTICAL')],
    ['English', 0.85, 0.7],
    ['German', 0.6, 0.3],
  ];

  for (const [name, freq, level] of demands) {
    const skillId = skillMap.get(name);
    if (!skillId) continue;
    const existing = await prisma.marketSkillDemand.findUnique({
      where: {
        snapshotId_skillId: {
          snapshotId: deSnapshot.id,
          skillId,
        },
      },
    });
    if (!existing) {
      await prisma.marketSkillDemand.create({
        data: {
          snapshotId: deSnapshot.id,
          skillId,
          frequency: freq,
          avgRequiredLevel: level,
        },
      });
    }
  }

  const seedJobPostings = [
    {
      countryCode: 'DE',
      roleName: 'Backend Developer',
      title: 'Backend Developer (Node.js)',
      company: 'Berlin Cloud Labs',
      location: 'Berlin, DE',
      source: 'seed',
      sourceUrl: 'https://example.com/jobs/backend-node-berlin',
      salaryMinUsd: 70000,
      salaryMaxUsd: 90000,
      salaryCurrency: 'USD',
      requirements: ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'English'],
    },
    {
      countryCode: 'DE',
      roleName: 'Backend Developer',
      title: 'Platform Engineer',
      company: 'Nordic Data Systems',
      location: 'Munich, DE',
      source: 'seed',
      sourceUrl: 'https://example.com/jobs/platform-engineer-munich',
      salaryMinUsd: 76000,
      salaryMaxUsd: 98000,
      salaryCurrency: 'USD',
      requirements: ['Node.js', 'Kubernetes', 'Terraform', 'Linux', 'AWS', 'English'],
    },
    {
      countryCode: 'DE',
      roleName: 'Backend Developer',
      title: 'API Engineer',
      company: 'Fintech Rail',
      location: 'Hamburg, DE',
      source: 'seed',
      sourceUrl: 'https://example.com/jobs/api-engineer-hamburg',
      salaryMinUsd: 68000,
      salaryMaxUsd: 88000,
      salaryCurrency: 'USD',
      requirements: ['REST API', 'Node.js', 'PostgreSQL', 'CI/CD', 'Git'],
    },
  ];

  for (const posting of seedJobPostings) {
    const requirementCompetencyIds = posting.requirements
      .map((name) => competencyMap.get(name))
      .filter((x): x is string => Boolean(x));
    const dedupKey = `seed|url:${posting.sourceUrl!.toLowerCase()}`;

    const existing = await (prisma as any).jobPosting.findUnique({
      where: { dedupKey },
    });

    if (existing) {
      await (prisma as any).jobPosting.update({
        where: { id: existing.id },
        data: {
          ...posting,
          requirements: posting.requirements,
          requirementCompetencyIds,
          dedupKey,
        },
      });
    } else {
      await (prisma as any).jobPosting.create({
        data: {
          ...posting,
          requirements: posting.requirements,
          requirementCompetencyIds,
          dedupKey,
        },
      });
    }
  }

  const colData: {
    country: string;
    city: string;
    data: [CostCategory, number][];
  }[] = [
    {
      country: 'DE',
      city: 'Berlin',
      data: [
        ['RENT', 1100],
        ['FOOD', 350],
        ['TRANSPORT', 86],
        ['UTILITIES', 250],
      ],
    },
    {
      country: 'PL',
      city: 'Warsaw',
      data: [
        ['RENT', 700],
        ['FOOD', 250],
        ['TRANSPORT', 40],
        ['UTILITIES', 180],
      ],
    },
    {
      country: 'CA',
      city: 'Toronto',
      data: [
        ['RENT', 1800],
        ['FOOD', 400],
        ['TRANSPORT', 130],
        ['UTILITIES', 180],
      ],
    },
  ];

  for (const city of colData) {
    for (const [category, amount] of city.data) {
      const existing = await prisma.costOfLivingData.findFirst({
        where: { country: city.country, city: city.city, category },
      });
      if (existing) {
        await prisma.costOfLivingData.update({
          where: { id: existing.id },
          data: { avgMonthlyUsd: amount },
        });
      } else {
        await prisma.costOfLivingData.create({
          data: {
            country: city.country,
            city: city.city,
            category,
            avgMonthlyUsd: amount,
          },
        });
      }
    }
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
