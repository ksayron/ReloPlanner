import {
  PrismaClient,
  SkillCategory,
  CostCategory,
  Role,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // --- Admin user ---
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@reloplanner.dev' },
    update: {},
    create: {
      email: 'admin@reloplanner.dev',
      passwordHash: adminHash,
      role: Role.ADMIN,
    },
  });

  // --- Skills ---
  const skills: {
    name: string;
    category: SkillCategory;
    parentName?: string;
  }[] = [
    // HARD_SKILL
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
    { name: 'AWS', category: 'HARD_SKILL' },
    { name: 'Azure', category: 'HARD_SKILL' },
    { name: 'Git', category: 'HARD_SKILL' },
    { name: 'CI/CD', category: 'HARD_SKILL' },
    { name: 'REST API', category: 'HARD_SKILL' },
    { name: 'GraphQL', category: 'HARD_SKILL' },
    { name: 'Linux', category: 'HARD_SKILL' },
    // LANGUAGE
    { name: 'English', category: 'LANGUAGE' },
    { name: 'German', category: 'LANGUAGE' },
    { name: 'French', category: 'LANGUAGE' },
    { name: 'Polish', category: 'LANGUAGE' },
    { name: 'Spanish', category: 'LANGUAGE' },
    // CERTIFICATION
    { name: 'AWS Certified', category: 'CERTIFICATION' },
    { name: 'Azure Certified', category: 'CERTIFICATION' },
    { name: 'IELTS', category: 'CERTIFICATION' },
    { name: 'Goethe-Zertifikat', category: 'CERTIFICATION' },
  ];

  // Create skills without parents first
  const skillMap = new Map<string, string>(); // name -> id
  for (const s of skills.filter((s) => !s.parentName)) {
    const created = await prisma.skill.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name, category: s.category },
    });
    skillMap.set(s.name, created.id);
  }
  // Create skills with parents
  for (const s of skills.filter((s) => s.parentName)) {
    const parentId = skillMap.get(s.parentName!);
    const created = await prisma.skill.upsert({
      where: { name: s.name },
      update: {},
      create: { name: s.name, category: s.category, parentId },
    });
    skillMap.set(s.name, created.id);
  }

  // --- Skill Aliases ---
  const aliases: [string, string][] = [
    ['JS', 'JavaScript'],
    ['TS', 'TypeScript'],
    ['k8s', 'Kubernetes'],
    ['Postgres', 'PostgreSQL'],
    ['Mongo', 'MongoDB'],
    ['node', 'Node.js'],
  ];
  for (const [alias, skillName] of aliases) {
    const skillId = skillMap.get(skillName)!;
    await prisma.skillAlias.upsert({
      where: { alias },
      update: {},
      create: { alias, skillId },
    });
  }

  // --- Transferability edges ---
  const transfers: [string, string, number][] = [
    ['C#', 'Java', 0.7],
    ['C#', 'TypeScript', 0.4],
    ['Java', 'C#', 0.6],
    ['JavaScript', 'TypeScript', 0.8],
    ['React', 'Vue', 0.6],
    ['React', 'Angular', 0.4],
    ['PostgreSQL', 'MySQL', 0.7],
    ['Express', 'NestJS', 0.5],
    ['Docker', 'Kubernetes', 0.3],
    ['AWS', 'Azure', 0.6],
    ['Python', 'JavaScript', 0.3],
    ['Django', 'Spring Boot', 0.3],
    ['Django', 'NestJS', 0.3],
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

  // --- Market Snapshot (Germany) ---
  const snapshot = await prisma.marketSnapshot.create({
    data: {
      country: 'DE',
      city: null,
      snapshotDate: new Date('2025-01-01'),
      source: 'manual',
      totalVacancies: 15000,
    },
  });

  const demands: [string, number, number][] = [
    ['JavaScript', 0.65, 0.7],
    ['TypeScript', 0.55, 0.75],
    ['Python', 0.45, 0.7],
    ['Java', 0.4, 0.75],
    ['React', 0.5, 0.7],
    ['Node.js', 0.35, 0.65],
    ['Docker', 0.4, 0.6],
    ['Kubernetes', 0.25, 0.55],
    ['AWS', 0.35, 0.6],
    ['PostgreSQL', 0.3, 0.65],
    ['Git', 0.7, 0.6],
    ['CI/CD', 0.35, 0.55],
    ['REST API', 0.55, 0.7],
    ['English', 0.85, 0.8],
    ['German', 0.6, 0.6],
  ];
  for (const [skillName, freq, level] of demands) {
    await prisma.marketSkillDemand.create({
      data: {
        snapshotId: snapshot.id,
        skillId: skillMap.get(skillName)!,
        frequency: freq,
        avgRequiredLevel: level,
      },
    });
  }

  // --- Cost of Living ---
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
    {
      country: 'UA',
      city: 'Kyiv',
      data: [
        ['RENT', 500],
        ['FOOD', 200],
        ['TRANSPORT', 25],
        ['UTILITIES', 100],
      ],
    },
  ];
  for (const city of colData) {
    for (const [category, amount] of city.data) {
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

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
